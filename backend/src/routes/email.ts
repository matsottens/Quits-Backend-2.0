import express, { Request, Response, NextFunction } from 'express';
import { google, gmail_v1 } from 'googleapis';
import { oauth2Client, gmail } from '../config/google.js';
import { summarizeEmail } from '../services/gemini.js';
import { extractSubscriptionDetails } from '../services/subscription.js';
import { authenticateUser, AuthRequest } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Apply authentication middleware to all routes except test-gemini
router.use((req, res, next) => {
  if (req.path === '/test-gemini') {
    return next();
  }
  return authenticateUser(req, res, next);
});

// Start email scanning
router.post('/scan', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's access token from Supabase (assuming it's stored)
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens') // Adjust table name if different
      .select('access_token')
      .eq('user_id', userId)
      .single();

    if (tokenError || !tokenData?.access_token) {
      console.error('Token fetch error:', tokenError);
      return res.status(401).json({ error: 'Gmail access token not found or error fetching it.' });
    }

    // Set credentials for this request
    oauth2Client.setCredentials({ access_token: tokenData.access_token });

    // Get list of emails (limit for testing)
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50, // Adjust as needed
      q: 'subject:(subscription OR receipt OR invoice OR payment OR billing)' // Example query
    });

    const messages = listResponse.data.messages;
    if (!messages || messages.length === 0) {
      return res.json({ status: 'completed', message: 'No relevant emails found.', subscriptions: [] });
    }

    // Store scan status in database
    const { error: scanError } = await supabase
      .from('email_scans')
      .upsert({ user_id: userId, status: 'in_progress', total_emails: messages.length, processed_emails: 0 }, { onConflict: 'user_id' })
      .select();

    if (scanError) {
      console.error('Error creating/updating scan record:', scanError);
      // Decide if this is critical - maybe continue anyway?
    }

    // Process emails in the background (no await here)
    processEmails(userId, messages);

    res.json({
      status: 'started',
      message: `Email scan started for ${messages.length} emails.`,
      total_emails: messages.length
    });
  } catch (error) {
    console.error('Error starting email scan:', error);
    // Update scan status to failed if possible
    if (req.user?.id) {
        await supabase.from('email_scans').update({ status: 'failed' }).eq('user_id', req.user.id);
    }
    res.status(500).json({ error: 'Failed to start email scan' });
  }
});

// Get scanning status
router.get('/status', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { data: scan, error } = await supabase
      .from('email_scans')
      .select('*')
      .eq('user_id', req.user?.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return res.status(404).json({ error: 'No scan found' });
    }

    res.json({
      status: scan.status,
      progress: Math.round((scan.processed_emails / scan.total_emails) * 100),
      total_emails: scan.total_emails,
      processed_emails: scan.processed_emails
    });
  } catch (error) {
    console.error('Error getting scan status:', error);
    res.status(500).json({ error: 'Failed to get scan status' });
  }
});

// Get subscription suggestions
router.get('/suggestions', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { data: suggestions, error } = await supabase
      .from('subscription_suggestions')
      .select('*')
      .eq('user_id', req.user?.id)
      .eq('status', 'pending');

    if (error) {
      return res.status(500).json({ error: 'Failed to get suggestions' });
    }

    res.json({ suggestions });
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// Confirm or reject a suggestion
router.post('/suggestions/:id/confirm', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { confirmed } = req.body;

    if (confirmed) {
      // Get suggestion details
      const { data: suggestion, error: suggestionError } = await supabase
        .from('subscription_suggestions')
        .select('*')
        .eq('id', id)
        .single();

      if (suggestionError) {
        return res.status(404).json({ error: 'Suggestion not found' });
      }

      // Add to subscriptions
      const { error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: req.user?.id,
          name: suggestion.name,
          price: suggestion.price,
          currency: suggestion.currency,
          billing_cycle: suggestion.billing_frequency,
          next_billing_date: suggestion.next_billing_date,
          email_id: suggestion.email_id
        });

      if (subscriptionError) {
        return res.status(500).json({ error: 'Failed to create subscription' });
      }
    }

    // Update suggestion status
    const { error: updateError } = await supabase
      .from('subscription_suggestions')
      .update({ status: confirmed ? 'accepted' : 'rejected' })
      .eq('id', id);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update suggestion' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error confirming suggestion:', error);
    res.status(500).json({ error: 'Failed to confirm suggestion' });
  }
});

// Helper function to process emails in the background
async function processEmails(userId: string, messages: gmail_v1.Schema$Message[]) {
  console.log(`Processing ${messages.length} emails for user ${userId}...`);
  let processedCount = 0;
  let suggestionCount = 0;

  const scanUpdateInterval = setInterval(async () => {
    await supabase
      .from('email_scans')
      .update({ processed_emails: processedCount })
      .eq('user_id', userId);
  }, 5000); // Update DB every 5 seconds

  try {
    for (const messagePart of messages) {
      if (!messagePart.id) continue;
      try {
        // Get full email content
        const emailResponse = await gmail.users.messages.get({
          userId: 'me',
          id: messagePart.id,
          format: 'full' // Get full details including headers and payload
        });

        const emailData = emailResponse.data;
        const content = extractEmailContent(emailData);
        if (!content) {
            processedCount++;
            continue;
        }

        // Analyze with Gemini
        const analysis = await summarizeEmail(content);

        if (analysis && analysis.isSubscription) {
          // Store suggestion in DB
          const { error } = await supabase
            .from('subscription_suggestions')
            .insert({
              user_id: userId,
              email_id: messagePart.id,
              name: analysis.serviceName,
              price: analysis.price,
              currency: analysis.currency,
              billing_frequency: analysis.billingFrequency,
              next_billing_date: analysis.nextBillingDate || null,
              status: 'pending' // Default status
            });
          if (error) {
            console.error(`Error saving suggestion for email ${messagePart.id}:`, error);
          } else {
            suggestionCount++;
          }
        }
        processedCount++;
      } catch (err: any) {
        processedCount++; // Count as processed even if error occurred
        console.error(`Error processing email ${messagePart.id}:`, err.message);
        // Handle specific errors e.g., rate limits, token expiry
        if (err.code === 401 || err.code === 403) {
            // Token might be invalid, stop processing or refresh
            console.error('Auth error during email processing, stopping scan.');
            await supabase.from('email_scans').update({ status: 'failed', error_message: 'Gmail token expired or invalid' }).eq('user_id', userId);
            break; // Stop the loop
        }
        // Add a small delay to avoid hitting rate limits too quickly after an error
        await new Promise(resolve => setTimeout(resolve, 500)); 
      }
    }
  } finally {
    clearInterval(scanUpdateInterval); // Stop the interval timer
    // Final update to scan status
    await supabase
      .from('email_scans')
      .update({ processed_emails: processedCount, status: 'completed' })
      .eq('user_id', userId);
    console.log(`Finished processing emails for user ${userId}. Processed: ${processedCount}, Suggestions found: ${suggestionCount}`);
  }
}

// Extracts email body content (plaintext preferrably)
function extractEmailContent(message: gmail_v1.Schema$Message): string | null {
  const payload = message.payload;
  if (!payload) return null;

  // Function to decode base64url
  const decodeBase64 = (data: string): string => Buffer.from(data, 'base64url').toString('utf8');

  // Recursive function to find the text/plain part
  function findPlainTextPart(parts: gmail_v1.Schema$MessagePart[]): string | null {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      if (part.parts) {
        const text = findPlainTextPart(part.parts);
        if (text) return text;
      }
    }
    return null;
  }
  
    // Recursive function to find the text/html part as fallback
  function findHtmlTextPart(parts: gmail_v1.Schema$MessagePart[]): string | null {
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      if (part.parts) {
        const text = findHtmlTextPart(part.parts);
        if (text) return text;
      }
    }
    return null;
  }

  // Check top-level payload first
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  
    if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64(payload.body.data); // Fallback if top level is HTML
  }

  // If multipart, search through parts
  if (payload.parts) {
    const plainText = findPlainTextPart(payload.parts);
    if (plainText) return plainText;
    // Fallback to HTML if plain text not found
    const htmlText = findHtmlTextPart(payload.parts);
     if (htmlText) return htmlText; // Consider stripping HTML tags here
  }

  // Fallback for non-multipart emails with just body data
  if (payload.body?.data) {
     // Determine mimeType if possible, assume text/plain or text/html as a last resort
      return decodeBase64(payload.body.data);
  }

  return null; // No suitable content found
}

// Test route for Gemini summarization (no auth needed for this specific test route)
router.post('/test-gemini', async (req: Request, res: Response) => {
  try {
    const { emailContent } = req.body;
    if (!emailContent) {
      return res.status(400).json({ error: 'Missing emailContent in request body' });
    }

    const analysis = await summarizeEmail(emailContent);
    res.json(analysis);
  } catch (error: any) {
    console.error('Error testing Gemini:', error);
    res.status(500).json({ error: 'Failed to test Gemini summarization', details: error.message });
  }
});

/**
 * Process an email and extract subscription details
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    const { emailContent } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: 'Email content is required' });
    }
    
    const result = await summarizeEmail(emailContent);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error processing email:', error);
    return res.status(500).json({ 
      error: 'Failed to process email',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router; 