import express, { Request, Response } from 'express';
import { google } from 'googleapis';
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
router.post('/scan', authenticateUser, async (req: AuthRequest, res) => {
  try {
    // Get user's access token
    const { data: tokens, error: tokenError } = await supabase
      .from('user_tokens')
      .select('access_token')
      .eq('user_id', req.user?.id)
      .single();

    if (tokenError || !tokens?.access_token) {
      return res.status(401).json({ error: 'No Gmail access token found' });
    }

    // Set credentials
    oauth2Client.setCredentials({ access_token: tokens.access_token });

    // Get list of emails (limit to last 50 for now)
    const { data: emails } = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: 'subject:(subscription OR receipt OR invoice OR payment OR billing)'
    });

    if (!emails.messages) {
      return res.json({ subscriptions: [] });
    }

    // Store scan status in database
    const { error: scanError } = await supabase
      .from('email_scans')
      .insert({
        user_id: req.user?.id,
        status: 'in_progress',
        total_emails: emails.messages.length,
        processed_emails: 0
      });

    if (scanError) {
      console.error('Error creating scan record:', scanError);
    }

    // Process each email in the background
    processEmails(req.user?.id!, emails.messages);

    res.json({ 
      status: 'started',
      total_emails: emails.messages.length
    });
  } catch (error) {
    console.error('Error starting email scan:', error);
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
async function processEmails(userId: string, messages: any[]) {
  try {
    let processedCount = 0;

    for (const message of messages) {
      try {
        // Get email content
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: message.id
        });

        const content = extractEmailContent(email.data);
        if (!content) continue;

        // Analyze with Gemini
        const analysis = await summarizeEmail(content);
        
        if (analysis.isSubscription) {
          // Store suggestion
          await supabase
            .from('subscription_suggestions')
            .insert({
              user_id: userId,
              email_id: message.id,
              name: analysis.serviceName,
              price: analysis.amount,
              currency: analysis.currency,
              billing_frequency: analysis.billingFrequency,
              next_billing_date: analysis.nextBillingDate,
              confidence: analysis.confidence || 0.8,
              email_subject: email.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value,
              email_date: email.data.internalDate
            });
        }

        // Update progress
        processedCount++;
        await supabase
          .from('email_scans')
          .update({ 
            processed_emails: processedCount,
            status: processedCount === messages.length ? 'complete' : 'in_progress'
          })
          .eq('user_id', userId);

      } catch (error) {
        console.error('Error processing email:', error);
        continue;
      }
    }
  } catch (error) {
    console.error('Error in background processing:', error);
    // Update scan status to error
    await supabase
      .from('email_scans')
      .update({ status: 'error' })
      .eq('user_id', userId);
  }
}

// Helper function to extract email content
function extractEmailContent(message: any): string | null {
  if (!message.payload) return null;
  
  let content = '';
  
  function extractFromParts(parts: any[]) {
    if (!parts) return;
    
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        content += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  }
  
  if (message.payload.parts) {
    extractFromParts(message.payload.parts);
  } else if (message.payload.body?.data) {
    content = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  }
  
  return content;
}

/**
 * Test endpoint to verify Gemini service is working
 */
router.post('/test-gemini', async (req: Request, res: Response) => {
  try {
    const { emailContent } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: 'Email content is required' });
    }
    
    console.log('Testing Gemini service with sample email content');
    const result = await summarizeEmail(emailContent);
    
    return res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error testing Gemini service:', error);
    return res.status(500).json({ 
      error: 'Failed to test Gemini service',
      details: error instanceof Error ? error.message : String(error)
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

export default router; 