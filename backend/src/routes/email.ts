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
  let failedCount = 0;

  const scanUpdateInterval = setInterval(async () => {
    await supabase
      .from('email_scans')
      .update({ 
        processed_emails: processedCount,
        failed_emails: failedCount,
        detected_subscriptions: suggestionCount
      })
      .eq('user_id', userId);
  }, 5000); // Update DB every 5 seconds

  try {
    for (const messagePart of messages) {
      if (!messagePart.id) continue;
      try {
        // Get full email content with headers
        const emailResponse = await gmail.users.messages.get({
          userId: 'me',
          id: messagePart.id,
          format: 'full' // Get full details including headers and payload
        });

        const emailData = emailResponse.data;
        
        // Extract email metadata for better context
        const headers = emailData.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        const to = headers.find(h => h.name === 'To')?.value || '';
        
        console.log(`Processing email: "${subject}" from ${from}`);
        
        // Get the content of the email
        const content = extractEmailContent(emailData);
        if (!content) {
            console.log(`No readable content found in email: ${subject}`);
            processedCount++;
            failedCount++;
            continue;
        }

        // Add email metadata to provide context for the analysis
        const emailWithMetadata = `
From: ${from}
To: ${to}
Subject: ${subject}
Date: ${date}

${content}
        `;

        // Analyze with Gemini
        const analysis = await summarizeEmail(emailWithMetadata);
        
        // Check if the email contains subscription information
        if (analysis && analysis.isSubscription) {
          console.log(`Subscription detected in email "${subject}": ${analysis.serviceName}`);
          
          // Store suggestion in DB
          const { error } = await supabase
            .from('subscription_suggestions')
            .insert({
              user_id: userId,
              email_id: messagePart.id,
              name: analysis.serviceName || 'Unknown Subscription',
              price: analysis.amount || analysis.price || 0,
              currency: analysis.currency || 'USD',
              billing_frequency: analysis.billingFrequency || analysis.billingCycle || 'monthly',
              next_billing_date: analysis.nextBillingDate || null,
              status: 'pending',
              confidence: analysis.confidence || 0,
              email_subject: subject,
              email_from: from,
              email_date: date
            });
            
          if (error) {
            console.error(`Error saving suggestion for email ${messagePart.id}:`, error);
          } else {
            suggestionCount++;
          }
        } else {
          console.log(`No subscription detected in email: "${subject}"`);
        }
        
        processedCount++;
      } catch (err: any) {
        processedCount++; // Count as processed even if error occurred
        failedCount++;
        
        console.error(`Error processing email ${messagePart.id}:`, err.message);
        
        // Handle specific errors e.g., rate limits, token expiry
        if (err.code === 401 || err.code === 403) {
            // Token might be invalid, stop processing or refresh
            console.error('Auth error during email processing, stopping scan.');
            await supabase.from('email_scans')
              .update({ 
                status: 'failed', 
                error_message: 'Gmail token expired or invalid' 
              })
              .eq('user_id', userId);
            break; // Stop the loop
        }
        
        // Handle rate limiting
        if (err.code === 429 || err.message?.includes('rate limit')) {
          console.log('Rate limit hit, pausing for 10 seconds before continuing');
          await new Promise(resolve => setTimeout(resolve, 10000));
        } else {
          // Add a small delay to avoid hitting rate limits too quickly after an error
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  } finally {
    clearInterval(scanUpdateInterval); // Stop the interval timer
    
    // Final update to scan status
    await supabase
      .from('email_scans')
      .update({ 
        processed_emails: processedCount, 
        status: 'completed',
        failed_emails: failedCount,
        detected_subscriptions: suggestionCount,
        completed_at: new Date().toISOString()
      })
      .eq('user_id', userId);
      
    console.log(`Finished processing emails for user ${userId}.`);
    console.log(`Processed: ${processedCount}, Failed: ${failedCount}, Subscriptions found: ${suggestionCount}`);
  }
}

// Helper function to extract email content from Gmail API message
function extractEmailContent(message: gmail_v1.Schema$Message): string | null {
  if (!message || !message.payload) {
    return null;
  }

  const decodeBase64 = (data: string): string => {
    try {
      return Buffer.from(data, 'base64url').toString('utf8');
    } catch (error) {
      try {
        // Fallback to standard base64 if base64url fails
        return Buffer.from(data, 'base64').toString('utf8');
      } catch (e) {
        console.error('Base64 decoding failed completely:', e);
        return '';
      }
    }
  };

  // Find plain text part in message parts
  function findPlainTextPart(parts: gmail_v1.Schema$MessagePart[] | undefined): string | null {
    if (!parts) return null;
    
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      
      // Recursively check nested parts
      if (part.parts) {
        const nestedResult = findPlainTextPart(part.parts);
        if (nestedResult) return nestedResult;
      }
    }
    
    return null;
  }

  // Find HTML part if plain text is not available
  function findHtmlTextPart(parts: gmail_v1.Schema$MessagePart[] | undefined): string | null {
    if (!parts) return null;
    
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        // Simple HTML to text conversion
        const htmlContent = decodeBase64(part.body.data);
        return htmlToPlainText(htmlContent);
      }
      
      // Recursively check nested parts
      if (part.parts) {
        const nestedResult = findHtmlTextPart(part.parts);
        if (nestedResult) return nestedResult;
      }
    }
    
    return null;
  }

  // Function to convert HTML to plain text
  function htmlToPlainText(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags and their content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags and their content
      .replace(/<[^>]*>/g, ' ') // Replace HTML tags with spaces
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with spaces
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // First check if the message body contains the content directly
  if (message.payload.body?.data) {
    return decodeBase64(message.payload.body.data);
  }

  // Otherwise look for content in parts
  if (message.payload.parts) {
    // First try to find plain text content
    const plainText = findPlainTextPart(message.payload.parts);
    if (plainText) return plainText;
    
    // Fall back to HTML if plain text not available
    const htmlText = findHtmlTextPart(message.payload.parts);
    if (htmlText) return htmlText;
  }

  // If we still have nothing, try extracting snippet as last resort
  if (message.snippet) {
    return message.snippet;
  }

  return null;
}

// Test route for Gemini summarization (no auth needed for this specific test route)
router.post('/test-gemini', async (req: Request, res: Response) => {
  try {
    const { emailContent } = req.body;
    if (!emailContent) {
      return res.status(400).json({ success: false, error: 'Missing emailContent in request body' });
    }

    console.log('Testing Gemini with email content length:', emailContent.length);
    
    // Truncate very long emails to avoid token limits
    const truncatedContent = emailContent.length > 10000 
      ? emailContent.substring(0, 10000) + '... [content truncated]' 
      : emailContent;
    
    const analysis = await summarizeEmail(truncatedContent);
    
    // Log success or failure
    if (analysis.isSubscription) {
      console.log('Gemini detected subscription:', {
        service: analysis.serviceName,
        price: analysis.amount || analysis.price,
        currency: analysis.currency,
        billing: analysis.billingFrequency || analysis.billingCycle
      });
    } else {
      console.log('Gemini did not detect a subscription in the content');
    }
    
    res.json({
      success: true,
      analysis,
      contentLength: emailContent.length,
      wasTruncated: emailContent.length > 10000
    });
  } catch (error: any) {
    console.error('Error testing Gemini:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test Gemini summarization', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
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

// Test API connection (no auth required)
router.get('/test-connection', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'API connection successful',
    version: '1.0',
    timestamp: new Date().toISOString()
  });
});

export default router; 