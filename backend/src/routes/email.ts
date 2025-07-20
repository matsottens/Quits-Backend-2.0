import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';

// Fixed, non-random namespace UUID (arbitrary) for deriving deterministic UUIDs from Google IDs
const USER_NAMESPACE = '5e2f6d9e-b3b5-4d1b-9f2c-111111111111';

import { google, gmail_v1 } from 'googleapis';
import { oauth2Client, gmail } from '../config/google';
import { summarizeEmail } from '../services/gemini';
import { extractSubscriptionDetails } from '../services/subscription';
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
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: User ID is required' });
      }
      
      // Extract Gmail token from request headers
      const gmailToken = req.headers['x-gmail-token'] as string;
      let useRealData = req.body.useRealData === true;
      
      console.log(`Scan requested for user ${userId}`);
      console.log(`Using real Gmail data: ${useRealData ? 'YES' : 'NO'}`);
      console.log(`Gmail token available: ${gmailToken ? 'YES' : 'NO'}`);
      
      // Check if a scan is already in progress
      const { data: existingScan, error: checkError } = await supabase
        .from('scan_history')
        .select('id, status')
        .eq('user_id', userId)
        .eq('status', 'in_progress')
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking for existing scan:', checkError);
        return res.status(500).json({
          error: 'Failed to check existing scan status'
        });
      }
      
      if (existingScan) {
        console.log(`Scan already in progress for user ${userId}`);
        return res.json({
          message: 'Scan already in progress',
          scanId: existingScan.id
        });
      }
      
      // Get user's OAuth tokens from database
      const { data: userTokens, error: tokenError } = await supabase
        .from('user_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .maybeSingle();

      // If the user_tokens table is missing the requested columns, Supabase returns code 42703
      if (tokenError && tokenError.code === '42703') {
        console.warn('user_tokens table schema mismatch; proceeding without stored tokens');
      }
      
      if (tokenError) {
        console.error('Error retrieving user tokens:', tokenError);
        
        // If we don't have stored tokens but have a header token, use that
        if (!gmailToken) {
          return res.status(400).json({
            error: 'No OAuth tokens found for user'
          });
        }
        
        console.log('Using token from request header instead of database');
      }
      
      // Choose the best token source - prefer header token if available
      const accessToken = gmailToken || userTokens?.access_token;
      
      if (!accessToken && useRealData) {
        console.warn('No access token found – switching to mock data.');
        useRealData = false;
      }
      
      // Generate a consistent UUID for both id and scan_id columns
      const newScanId = randomUUID();
      
      // Create scan record in database - only include columns that definitely exist
      const { data: scanRecord, error: scanError } = await supabase
        .from('scan_history')
        .insert({
          id: newScanId,          // primary key
          scan_id: newScanId,     // business identifier
          user_id: userId,
          status: 'in_progress',
          emails_to_process: 0,
          emails_processed: 0
        })
        .select('id,status,emails_to_process,emails_processed')
        .single();

      if (scanError) {
        console.error('Error creating scan record:', scanError);
        return res.status(500).json({
          error: 'Failed to create scan record'
        });
      }
      
      // Start the background process to scan emails
      processEmails(userId, scanRecord.id, accessToken, useRealData)
        .catch(err => {
          console.error('Background email processing error:', err);
          supabase
            .from('scan_history')
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
      
      return res.json({
        message: 'Email scanning started',
        scanId: scanRecord.id
      });
      
    } catch (error) {
      console.error('Error starting email scan:', error);
      return res.status(500).json({
        error: 'Failed to start email scanning',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Get scanning status
router.get('/status', 
  authenticateUser as RequestHandler,
  async (req: AuthRequest, res) => {
    try {
      // Optional legacy parameter ?scanId=scan_xxx
      const requestedId = typeof req.query.scanId === 'string' ? req.query.scanId : null;

      let scan;
      let error;

      try {
        if (requestedId) {
          // If a specific scan ID is provided we can look it up directly without knowing the user UUID.
          ({ data: scan, error } = await supabase
            .from('scan_history')
            .select('*')
            .eq('scan_id', requestedId)
            .single());
        } else {
          // We only have the Google user ID (from the JWT). Resolve it to the internal UUID stored in the users table.
          let userRecord;
          const { data: userTmp, error: userLookupError } = await supabase
            .from('users')
            .select('id')
            .eq('google_id', req.user?.id)
            .maybeSingle();

          userRecord = userTmp || null;

          if (userLookupError) {
            error = userLookupError;
          } else if (!userRecord) {
            // Fall back to email match if google_id is not yet stored.
            const { data: userByEmail, error: emailLookupError } = await supabase
              .from('users')
              .select('id')
              .eq('email', req.user?.email)
              .maybeSingle();

            if (emailLookupError) {
              error = emailLookupError;
            }

            if (userByEmail) {
              scan = undefined; // will be fetched below
              userRecord = userByEmail;
            }
          }

          if (!error && userRecord?.id) {
            ({ data: scan, error } = await supabase
              .from('scan_history')
              .select('*')
              .eq('user_id', userRecord.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single());
          }
        }
      } catch (e) {
        console.error('Error querying scan history:', e);
        return res.status(500).json({ error: 'Failed to query scan history' });
      }

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'No scan found' });
        }
        console.error('Error fetching scan:', error);
        return res.status(500).json({ error: 'Failed to get scan status' });
      }

      if (!scan) {
        return res.status(404).json({ error: 'No scan found' });
      }

      // Safeguard division by zero
      const totalEmails = scan.emails_to_process || 0;
      const processedEmails = scan.emails_processed || 0;
      const progressPct = totalEmails > 0 ? Math.round((processedEmails / totalEmails) * 100) : 0;

      res.json({
        status: scan.status,
        progress: progressPct,
        stats: {
          emails_found: scan.emails_found,
          emails_to_process: scan.emails_to_process,
          emails_processed: scan.emails_processed,
          subscriptions_found: scan.subscriptions_found
        },
        scan_id: scan.scan_id || scan.id
      });
      return;
    } catch (error) {
      console.error('Error getting scan status:', error);
      res.status(500).json({ error: 'Failed to get scan status' });
    }
  }
);

// Get scanning status by scan ID (UUID)
router.get('/status/:id',
  authenticateUser as RequestHandler,
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Missing scan ID' });
      }

      const { data: scan, error } = await supabase
        .from('scan_history')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Scan not found' });
        }
        console.error('Error fetching scan:', error);
        return res.status(500).json({ error: 'Failed to get scan status' });
      }

      res.json({
        status: scan.status,
        progress: Math.round((scan.emails_processed / (scan.emails_to_process || 1)) * 100),
        stats: {
          emails_found: scan.emails_found,
          emails_to_process: scan.emails_to_process,
          emails_processed: scan.emails_processed,
          subscriptions_found: scan.subscriptions_found
        },
        scan_id: scan.id
      });
    } catch (err) {
      console.error('Error getting scan status by ID:', err);
      res.status(500).json({ error: 'Failed to get scan status' });
    }
  }
);

// Get subscription suggestions
router.get('/suggestions', 
  authenticateUser as RequestHandler,
  async (req: AuthRequest, res) => {
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
  }
);

// Confirm or reject a suggestion
router.post('/suggestions/:id/confirm', 
  authenticateUser as RequestHandler,
  async (req: AuthRequest, res) => {
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
      await supabase.from('scan_history').update({ emails_to_process: totalEmails }).eq('id', scanId);
      if (messages.length === 0) {
        console.log('No matching emails found');
        // Set scan to ready_for_analysis anyway (Edge Function will see no emails)
        await supabase.from('scan_history').update({ status: 'ready_for_analysis', updated_at: new Date().toISOString() }).eq('id', scanId);
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
              gmail_message_id: message.id, // ensure NOT NULL column is populated
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
      await supabase.from('scan_history').update({ emails_to_process: totalEmails }).eq('id', scanId);
      for (let i = 0; i < mockEmails; i++) {
        filteredEmails.push({
          user_id: userId,
          scan_id: scanId,
          gmail_message_id: `mock-${i+1}`,
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
      const { data: inserted, error: insertErr } = await supabase
        .from('email_data')
        .insert(filteredEmails)
        .select('id');

      if (insertErr) {
        console.error('Failed to insert email_data:', insertErr);
      } else {
        // Build subscription_analysis rows
        const analysisRows = (inserted || []).map((row: any) => ({
          email_data_id: row.id,
          scan_id: scanId,
          user_id: userId,
          analysis_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        if (analysisRows.length > 0) {
          const { error: analysisErr } = await supabase
            .from('subscription_analysis')
            .insert(analysisRows);
          if (analysisErr) {
            console.error('Failed to insert subscription_analysis rows:', analysisErr);
          }
        }

        // Update processed email count for progress tracking
        try {
          await supabase
            .from('scan_history')
            .update({ emails_processed: processedCount })
            .eq('id', scanId);
        } catch (updateCountErr) {
          console.warn('Failed to update processed email count:', updateCountErr);
        }
      }
    }
    // After setting status ready_for_analysis
    await supabase.from('scan_history').update({ 
      status: 'ready_for_analysis', 
      emails_found: filteredEmails.length,
      updated_at: new Date().toISOString() 
    }).eq('id', scanId);

    // Fire the trigger endpoint immediately to avoid waiting for cron
    (async () => {
      try {
        const triggerPort = process.env.PORT || 3000;
        const triggerUrl = `http://localhost:${triggerPort}/api/trigger-gemini-scan`;
        console.log('EMAIL ROUTE: Manually hitting trigger endpoint at', triggerUrl);
        await fetch(triggerUrl, { method: 'GET' });
      } catch (triggerErr) {
        console.warn('EMAIL ROUTE: Failed to hit trigger endpoint:', triggerErr);
      }
    })();

    console.log(`Triggering Gemini analysis for scan ${scanId}`);
    try {
      // Don't call edge function directly - let the trigger handle it
      // This ensures proper queuing and retry logic
      console.log(`Scan ${scanId} marked as ready_for_analysis - trigger will pick it up`);
    } catch (invokeEx) {
      console.error('Failed to invoke Gemini edge function:', invokeEx);
    }

    // Trigger will handle the analysis and completion
    console.log(`Scan ${scanId} analysis triggered.`);
  } catch (error) {
    console.error('Error processing emails:', error);
    // Set scan to failed
    await supabase.from('scan_history').update({ status: 'failed', updated_at: new Date().toISOString(), error_message: error instanceof Error ? error.message : String(error) }).eq('id', scanId);
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
}) as RequestHandler);

/**
 * Process an email and extract subscription details
 */
router.post('/process', (async (req: Request, res: Response) => {
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