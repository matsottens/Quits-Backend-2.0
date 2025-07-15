import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { google, gmail_v1 } from 'googleapis';
import { oauth2Client, gmail } from '../config/google';
import { summarizeEmail } from '../services/gemini.js';
import { extractSubscriptionDetails } from '../services/subscription.js';
import { authenticateUser, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
// import { genAI, generateContent } from '../services/gemini.js';
// import { Content, Part } from '@google/generative-ai';

const router = express.Router();

// Middleware to check authentication for all email routes
// except for specific unauthenticated ones
router.use(((req, res, next) => {
  // Skip authentication for specific routes
  if (req.path === '/test' || req.path === '/test-gemini' || req.path === '/process') {
    return next();
  }
  
  // Otherwise use the authentication middleware
  return authenticateUser(req, res, next);
}) as RequestHandler);

// Start email scanning
router.post('/scan', 
  authenticateUser as RequestHandler,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized: User ID is required'
        });
        return;
      }
      
      // Extract Gmail token from request headers
      const gmailToken = req.headers['x-gmail-token'] as string;
      const useRealData = req.body.useRealData === true;
      
      console.log(`Scan requested for user ${userId}`);
      console.log(`Using real Gmail data: ${useRealData ? 'YES' : 'NO'}`);
      console.log(`Gmail token available: ${gmailToken ? 'YES' : 'NO'}`);
      
      // Check if a scan is already in progress
      const { data: existingScan, error: checkError } = await supabase
        .from('email_scans')
        .select('id, status')
        .eq('user_id', userId)
        .eq('status', 'in_progress')
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking for existing scan:', checkError);
        res.status(500).json({
          error: 'Failed to check existing scan status'
        });
        return;
      }
      
      if (existingScan) {
        console.log(`Scan already in progress for user ${userId}`);
        res.json({
          message: 'Scan already in progress',
          scanId: existingScan.id
        });
        return;
      }
      
      // Get user's OAuth tokens from database
      const { data: userTokens, error: tokenError } = await supabase
        .from('user_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();
      
      if (tokenError) {
        console.error('Error retrieving user tokens:', tokenError);
        
        // If we don't have stored tokens but have a header token, use that
        if (!gmailToken) {
          res.status(400).json({
            error: 'No OAuth tokens found for user'
          });
          return;
        }
        
        console.log('Using token from request header instead of database');
      }
      
      // Choose the best token source - prefer header token if available
      const accessToken = gmailToken || userTokens?.access_token;
      
      if (!accessToken && useRealData) {
        res.status(400).json({
          error: 'No access token available for Gmail API'
        });
        return;
      }
      
      // Create scan record in database
      const { data: scanRecord, error: scanError } = await supabase
        .from('email_scans')
        .insert({
          user_id: userId,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          use_real_data: useRealData,
          total_emails: 0,
          processed_emails: 0
        })
        .select()
        .single();

      if (scanError) {
        console.error('Error creating scan record:', scanError);
        res.status(500).json({
          error: 'Failed to create scan record'
        });
        return;
      }
      
      // Start the background process to scan emails
      processEmails(userId, scanRecord.id, accessToken, useRealData)
        .catch(err => {
          console.error('Background email processing error:', err);
          supabase
            .from('email_scans')
            .update({
              status: 'failed',
              error_message: err.message,
              completed_at: new Date().toISOString()
            })
            .eq('id', scanRecord.id)
            .then(() => {
              console.log(`Scan ${scanRecord.id} marked as failed due to error`);
            });
        });
      
      res.json({
        message: 'Email scanning started',
        scanId: scanRecord.id
      });
      return;
      
    } catch (error) {
      console.error('Error starting email scan:', error);
      res.status(500).json({
        error: 'Failed to start email scanning',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
      return;
    }
  }
);

// Get scanning status
router.get('/status', 
  authenticateUser as RequestHandler,
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const { data: scan, error } = await supabase
        .from('email_scans')
        .select('*')
        .eq('user_id', req.user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        res.status(404).json({ error: 'No scan found' });
        return;
      }

      res.json({
        status: scan.status,
        progress: Math.round((scan.processed_emails / scan.total_emails) * 100),
        total_emails: scan.total_emails,
        processed_emails: scan.processed_emails
      });
      return;
    } catch (error) {
      console.error('Error getting scan status:', error);
      res.status(500).json({ error: 'Failed to get scan status' });
      return;
    }
  }
);

// Get subscription suggestions
router.get('/suggestions', 
  authenticateUser as RequestHandler,
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const { data: suggestions, error } = await supabase
        .from('subscription_suggestions')
        .select('*')
        .eq('user_id', req.user?.id)
        .eq('status', 'pending');

      if (error) {
        res.status(500).json({ error: 'Failed to get suggestions' });
        return;
      }

      res.json({ suggestions });
      return;
    } catch (error) {
      console.error('Error getting suggestions:', error);
      res.status(500).json({ error: 'Failed to get suggestions' });
      return;
    }
  }
);

// Confirm or reject a suggestion
router.post('/suggestions/:id/confirm', 
  authenticateUser as RequestHandler,
  async (req: AuthRequest, res): Promise<void> => {
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
          res.status(404).json({ error: 'Suggestion not found' });
          return;
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
          res.status(500).json({ error: 'Failed to create subscription' });
          return;
        }
      }

      // Update suggestion status
      const { error: updateError } = await supabase
        .from('subscription_suggestions')
        .update({ status: confirmed ? 'accepted' : 'rejected' })
        .eq('id', id);

      if (updateError) {
        res.status(500).json({ error: 'Failed to update suggestion' });
        return;
      }

      res.json({ success: true });
      return;
    } catch (error) {
      console.error('Error confirming suggestion:', error);
      res.status(500).json({ error: 'Failed to confirm suggestion' });
      return;
    }
  }
);

// Helper function to process emails in the background
async function processEmails(userId: string, scanId: string, accessToken: string, useRealData: boolean) {
  console.log(`Processing emails for user ${userId} with scan ID ${scanId}`);
  let processedCount = 0;
  let totalEmails = 0;
  let filteredEmails = [];

  try {
    if (useRealData && accessToken) {
      console.log('Using real Gmail API with provided token');
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const query = 'subject:(subscription OR receipt OR invoice OR payment OR billing OR renewal)';
      console.log(`Searching emails with query: ${query}`);
      const messageList = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 50,
        q: query
      });
      const messages = messageList.data.messages || [];
      totalEmails = messages.length;
      await supabase.from('email_scans').update({ total_emails: totalEmails }).eq('id', scanId);
      if (messages.length === 0) {
        console.log('No matching emails found');
        // Set scan to ready_for_analysis anyway (Edge Function will see no emails)
        await supabase.from('email_scans').update({ status: 'ready_for_analysis', updated_at: new Date().toISOString() }).eq('id', scanId);
        return;
      }
      for (const message of messages) {
        if (!message.id) continue;
        try {
          const emailResponse = await gmail.users.messages.get({ userId: 'me', id: message.id, format: 'full' });
          const emailData = emailResponse.data;
          const headers = emailData.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
          const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
          const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
          let content = '';
          if (emailData.snippet) content = emailData.snippet;
          if (emailData.payload?.body?.data) {
            content = Buffer.from(emailData.payload.body.data, 'base64').toString('utf8');
          } else if (emailData.payload?.parts) {
            for (const part of emailData.payload.parts) {
              if (part.mimeType === 'text/plain' && part.body?.data) {
                content = Buffer.from(part.body.data, 'base64').toString('utf8');
                break;
              } else if (part.mimeType === 'text/html' && part.body?.data) {
                const html = Buffer.from(part.body.data, 'base64').toString('utf8');
                content = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                break;
              }
            }
          }
          // Filter logic: Only add if content/subject looks like a subscription (simple keyword check)
          const lower = (subject + ' ' + content).toLowerCase();
          if (/subscription|renew|billing|payment|invoice|receipt/.test(lower)) {
            filteredEmails.push({
              user_id: userId,
              scan_id: scanId,
              subject,
              sender: from,
              date,
              content,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
          processedCount++;
        } catch (err) {
          console.error(`Error processing email ${message.id}:`, err instanceof Error ? err.message : err);
        }
      }
    } else {
      // Mock implementation
      console.log('Using mock implementation - no real Gmail API access');
      await new Promise(resolve => setTimeout(resolve, 3000));
      const mockEmails = 20;
      totalEmails = mockEmails;
      await supabase.from('email_scans').update({ total_emails: totalEmails }).eq('id', scanId);
      for (let i = 0; i < mockEmails; i++) {
        filteredEmails.push({
          user_id: userId,
          scan_id: scanId,
          subject: `Mock Subscription Email #${i+1}`,
          sender: 'mock@service.com',
          date: new Date().toISOString(),
          content: 'This is a mock subscription email.',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        processedCount++;
      }
    }
    // Insert all filtered emails
    if (filteredEmails.length > 0) {
      await supabase.from('email_data').insert(filteredEmails);
    }
    // Set scan to ready_for_analysis (Edge Function will do analysis and set completed)
    await supabase.from('email_scans').update({ status: 'ready_for_analysis', updated_at: new Date().toISOString() }).eq('id', scanId);
    console.log(`Scan ${scanId} set to ready_for_analysis with ${filteredEmails.length} emails.`);
  } catch (error) {
    console.error('Error processing emails:', error);
    // Set scan to failed
    await supabase.from('email_scans').update({ status: 'failed', updated_at: new Date().toISOString(), error_message: error instanceof Error ? error.message : String(error) }).eq('id', scanId);
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
router.post('/test-gemini', (async (req: Request, res: Response) => {
  try {
    const { emailContent } = req.body;
    if (!emailContent) {
      res.status(400).json({ success: false, error: 'Missing emailContent in request body' });
      return;
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
    return;
  } catch (error: any) {
    console.error('Error testing Gemini:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test Gemini summarization', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
    return;
  }
}) as RequestHandler);

/**
 * Process an email and extract subscription details
 */
router.post('/process', (async (req: Request, res: Response) => {
  try {
    const { emailContent } = req.body;
    
    if (!emailContent) {
      res.status(400).json({ error: 'Email content is required' });
      return;
    }
    
    const result = await summarizeEmail(emailContent);
    
    res.json({
      success: true,
      data: result
    });
    return;
  } catch (error) {
    console.error('Error processing email:', error);
    res.status(500).json({ 
      error: 'Failed to process email',
      details: error instanceof Error ? error.message : String(error)
    });
    return;
  }
}) as RequestHandler);

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