// Catch-all handler for subscription endpoints
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import jsonwebtoken from 'jsonwebtoken';

const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

console.log(`[PATH] Supabase URL defined: ${!!supabaseUrl}`);
console.log(`[PATH] Supabase key defined: ${!!supabaseKey}`);
console.log(`[PATH] Supabase URL: ${supabaseUrl}`);
console.log(`[PATH] Supabase key role: ${supabaseKey ? (supabaseKey.includes('role":"service_role') ? 'service_role' : 'anon') : 'undefined'}`);

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to check if Gemini AI scanning is available
const isGeminiScanningAvailable = () => {
  return !!process.env.GEMINI_API_KEY;
};

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log(`Handling OPTIONS preflight request for ${req.url}`);
    return res.status(204).end();
  }

  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  console.log(`Subscription catch-all handler processing: ${req.url}`);

  try {
    // Parse the path to determine which operation to perform
    const path = req.query.path || [];
    let isSpecificSubscription = path.length > 0;
    let subscriptionId = isSpecificSubscription ? path[0] : null;

    // Fallback: if the dynamic path param didn't populate (Vercel quirk) extract it from the URL
    if (!isSpecificSubscription) {
      const urlParts = req.url.split('/').filter(Boolean); // e.g. ['', 'api', 'subscriptions', ':id'] → ['api','subscriptions',':id']
      const subsIdx = urlParts.indexOf('subscriptions');
      if (subsIdx !== -1 && urlParts.length > subsIdx + 1) {
        subscriptionId = urlParts[subsIdx + 1];
        isSpecificSubscription = true;
        console.log(`[PATH] Fallback extracted subscriptionId from URL: ${subscriptionId}`);
      }
    }
    
    // Check if Supabase configuration is available
    if (!supabaseUrl || !supabaseKey) {
      console.error('[PATH] Missing Supabase configuration');
      return res.status(500).json({
        error: 'missing_config',
        message: 'Database configuration is missing',
        details: {
          url_defined: !!supabaseUrl,
          key_defined: !!supabaseKey
        }
      });
    }
    
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Verify the token
      try {
        const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
        const decoded = verify(token, jwtSecret);
      const userId = decoded.id || decoded.sub; // Use sub as fallback (common in JWT)
      
      if (!userId) {
        return res.status(401).json({ error: 'Invalid user ID in token' });
      }
      
      console.log(`[PATH] Processing request for user: ${userId}, operation: ${req.method}, path: ${path.join('/')}`);
      
      // First, look up the database user ID
      try {
        // Build dynamic OR filter to avoid passing non-UUID google IDs to a uuid column
        const filters = [
          `email.eq.${encodeURIComponent(decoded.email)}`
        ];
        // Add id filter (internal UUID)
        if (userId && /^[0-9a-fA-F-]{36}$/.test(userId)) {
          filters.push(`id.eq.${encodeURIComponent(userId)}`);
        }
        // Only include google_id filter if it looks like a UUID (Supabase column type is uuid)
        if (userId && /^[0-9a-fA-F-]{36}$/.test(userId)) {
          filters.push(`google_id.eq.${encodeURIComponent(userId)}`);
        }

        const filterString = filters.join(',');

        const userLookupResponse = await fetch(
          `${supabaseUrl}/rest/v1/users?select=id,email,google_id&or=(${filterString})`, 
          {
            method: 'GET',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (!userLookupResponse.ok) {
          const errorText = await userLookupResponse.text();
          console.error('[PATH] User lookup failed:', errorText);
          
          // User lookup failed, returning empty subscriptions array as requested.
          return res.status(200).json({
            success: true,
            subscriptions: [],
            meta: {
              total: 0,
              totalMonthly: 0,
              totalYearly: 0,
              totalAnnualized: 0,
              lookup_failed: true,
              error: 'User lookup failed',
              error_details: errorText
            }
          });
        }
        
        const users = await userLookupResponse.json();
        
        // Create a new user if not found
        let dbUserId;
        if (!users || users.length === 0) {
          console.log(`[PATH] User not found in database, creating new user for: ${decoded.email}`);
          
          // Create a new user
          const createUserResponse = await fetch(
            `${supabaseUrl}/rest/v1/users`, 
            {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({
                email: decoded.email,
                google_id: userId,
                name: decoded.name || decoded.email.split('@')[0],
                avatar_url: decoded.picture || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
            }
          );
          
          if (!createUserResponse.ok) {
            const errorText = await createUserResponse.text();
            console.error('[PATH] Failed to create user:', errorText);

            // Gracefully handle duplicate email – another row already exists.
            if (errorText.includes('duplicate key value')) {
              console.log('[PATH] Duplicate e-mail detected, fetching existing user row');
              const { data: existingAfterDup, error: dupFetchErr } = await supabase
                .from('users')
                .select('id')
                .eq('email', decoded.email)
                .maybeSingle();

              if (dupFetchErr || !existingAfterDup) {
                throw new Error(`[PATH] User exists but could not be fetched: ${dupFetchErr?.message || 'unknown'}`);
              }

              dbUserId = existingAfterDup.id;
              console.log('[PATH] Using existing user ID after duplicate error:', dbUserId);
            } else {
              throw new Error(`[PATH] Failed to create user: ${errorText}`);
            }
          } else {
            const newUser = await createUserResponse.json();
            dbUserId = newUser[0].id;
            console.log(`[PATH] Created new user with ID: ${dbUserId}`);
          }

          // Extract Gmail token from JWT token for email reading
          const gmailToken = decoded.gmail_token;
          
          if (gmailToken) {
            console.log('[PATH] Gmail token found in JWT, starting email reading process for new user');
            
            try {
              // Create scan record in scan_history table
              const scanRecordResponse = await fetch(
                `${supabaseUrl}/rest/v1/scan_history`,
                {
                  method: 'POST',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  },
                  body: JSON.stringify({
                    scan_id: `scan_${Date.now()}_${dbUserId}`,
                    user_id: dbUserId,
                    status: 'in_progress',
                    progress: 0,
                    emails_found: 0,
                    emails_to_process: 0,
                    emails_processed: 0,
                    emails_scanned: 0,
                    subscriptions_found: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  })
                }
              );

              if (scanRecordResponse.ok) {
                const scanRecord = await scanRecordResponse.json();
                console.log(`[PATH] Created scan record with ID: ${scanRecord[0].id}`);
                
                // Set up Gmail API
                const oauth2Client = new google.auth.OAuth2();
                oauth2Client.setCredentials({ access_token: gmailToken });
                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                
                // Search for subscription-related emails
                const query = 'subject:(subscription OR receipt OR invoice OR payment OR billing OR renewal)';
                console.log(`[PATH] Searching emails with query: ${query}`);
                
                const messageList = await gmail.users.messages.list({
                  userId: 'me',
                  maxResults: 50,
                  q: query
                });
                
                const messages = messageList.data.messages || [];
                console.log(`[PATH] Found ${messages.length} potential subscription emails`);
                
                // Update scan record with total emails found
                await fetch(
                  `${supabaseUrl}/rest/v1/scan_history?id=eq.${scanRecord[0].id}`,
                  {
                    method: 'PATCH',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      emails_found: messages.length,
                      emails_to_process: messages.length,
                      updated_at: new Date().toISOString()
                    })
                  }
                );
                
                // Process each email and store basic info
                let processedCount = 0;
                for (const message of messages) {
                  if (!message.id) continue;
                  
                  try {
                    // Get full message content
                    const emailResponse = await gmail.users.messages.get({
                      userId: 'me',
                      id: message.id,
                      format: 'full'
                    });
                    
                    const emailData = emailResponse.data;
                    
                    // Extract headers
                    const headers = emailData.payload?.headers || [];
                    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
                    const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
                    
                    // Extract content (basic text extraction)
                    let content = '';
                    if (emailData.snippet) {
                      content = emailData.snippet;
                    } else if (emailData.payload?.body?.data) {
                      content = Buffer.from(emailData.payload.body.data, 'base64').toString('utf8');
                    } else if (emailData.payload?.parts) {
                      for (const part of emailData.payload.parts) {
                        if (part.mimeType === 'text/plain' && part.body?.data) {
                          content = Buffer.from(part.body.data, 'base64').toString('utf8');
                          break;
                        }
                      }
                    }
                    
                    // Store email data in a new table called 'email_data'
                    const emailDataResponse = await fetch(
                      `${supabaseUrl}/rest/v1/email_data`,
                      {
                        method: 'POST',
                        headers: {
                          'apikey': supabaseKey,
                          'Authorization': `Bearer ${supabaseKey}`,
                          'Content-Type': 'application/json',
                          'Prefer': 'return=representation'
                        },
                        body: JSON.stringify({
                          scan_id: scanRecord[0].scan_id,
                          user_id: dbUserId,
                          gmail_message_id: message.id,
                          subject: subject,
                          sender: from,
                          date: date,
                          content: content.substring(0, 2000), // Store first 2000 chars
                          content_preview: content.substring(0, 500), // Store first 500 chars
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString()
                        })
                      }
                    );
                    
                    if (!emailDataResponse.ok) {
                      console.error(`[PATH] Failed to store email data for message ${message.id}:`, await emailDataResponse.text());
                    } else {
                      console.log(`[PATH] Stored email data for message ${message.id}`);
                    }
                    
                    // Update scan progress
                    await fetch(
                      `${supabaseUrl}/rest/v1/scan_history?id=eq.${scanRecord[0].id}`,
                      {
                        method: 'PATCH',
                        headers: {
                          'apikey': supabaseKey,
                          'Authorization': `Bearer ${supabaseKey}`,
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          emails_processed: processedCount + 1,
                          progress: Math.floor(((processedCount + 1) / messages.length) * 100),
                          updated_at: new Date().toISOString()
                        })
                      }
                    );
                    
                    processedCount++;
                    console.log(`[PATH] Processed email ${processedCount}/${messages.length}: ${subject}`);
                    
                  } catch (emailError) {
                    console.error(`[PATH] Error processing email ${message.id}:`, emailError);
                  }
                }
                
                // Set scan status to 'ready_for_analysis' so Edge Function can process with Gemini
                await fetch(
                  `${supabaseUrl}/rest/v1/scan_history?id=eq.${scanRecord[0].id}`,
                  {
                    method: 'PATCH',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      status: 'ready_for_analysis',
                      progress: 90,
                      emails_processed: processedCount,
                      updated_at: new Date().toISOString()
                    })
                  }
                );
                console.log('[PATH] Scan status set to ready_for_analysis - Edge Function will process analysis');
                // Return immediately, do not call Gemini analysis here
                
              } else {
                console.error('[PATH] Failed to create scan record:', await scanRecordResponse.text());
              }
              
            } catch (emailReadingError) {
              console.error('[PATH] Error during email reading process:', emailReadingError);
              // Continue with user creation even if email reading fails
            }
          } else {
            console.log('[PATH] No Gmail token provided – creating placeholder scan record');

            try {
              const placeholderRes = await fetch(
                `${supabaseUrl}/rest/v1/scan_history`,
                {
                  method: 'POST',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  },
                  body: JSON.stringify({
                    scan_id: `scan_${Date.now()}_${dbUserId}`,
                    user_id: dbUserId,
                    status: 'pending',
                    progress: 0,
                    emails_found: 0,
                    emails_to_process: 0,
                    emails_processed: 0,
                    emails_scanned: 0,
                    subscriptions_found: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  })
                }
              );
              if (placeholderRes.ok) {
                const createdScan = await placeholderRes.json();
                console.log('[PATH] Placeholder scan created with ID:', createdScan[0].scan_id);
              } else {
                console.error('[PATH] Failed to create placeholder scan:', await placeholderRes.text());
              }
            } catch (phErr) {
              console.error('[PATH] Error creating placeholder scan:', phErr);
            }
          }
        } else {
          dbUserId = users[0].id;
          console.log(`[PATH] Found existing user with ID: ${dbUserId}`);
        }
        
        // After user lookup/creation, handle the actual API request method (GET, PUT, POST, DELETE)
        if (req.method === 'GET') {
          if (isSpecificSubscription) {
            // Fetch specific subscription
            const { data, error } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('id', subscriptionId)
              .eq('user_id', dbUserId) // Ensure user can only access their own subscriptions
              .single();

            if (error) {
              console.error(`[PATH] Error fetching subscription ${subscriptionId}:`, error);
              return res.status(500).json({ error: 'Failed to fetch subscription' });
            }

            if (!data) {
              return res.status(404).json({ error: `Subscription with ID ${subscriptionId} not found` });
            }

            return res.status(200).json({ success: true, subscription: data });

          } else {
            // Fetch all subscriptions for the user
            const { data, error } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('user_id', dbUserId);

            if (error) {
              console.error('[PATH] Error fetching subscriptions:', error);
              return res.status(500).json({ error: 'Failed to fetch subscriptions' });
            }
            
            return res.status(200).json({ success: true, subscriptions: data });
          }
        } else if (req.method === 'POST') {
          // Create a new subscription
          const subscriptionData = req.body;
          if (!subscriptionData || !subscriptionData.name || !subscriptionData.price) {
            return res.status(400).json({ error: 'Missing required subscription data' });
          }

          const { data, error } = await supabase
            .from('subscriptions')
            .insert({ ...subscriptionData, user_id: dbUserId })
            .select()
            .single();

          if (error) {
            console.error('[PATH] Error creating subscription:', error);
            return res.status(500).json({ error: 'Failed to create subscription' });
          }
          
          return res.status(201).json({ success: true, subscription: data });

        } else if (req.method === 'PUT' && isSpecificSubscription) {
          // Update an existing subscription
          const subscriptionData = req.body;
          if (!subscriptionData) {
            return res.status(400).json({ error: 'Missing subscription data for update' });
          }

          const { data, error } = await supabase
            .from('subscriptions')
            .update(subscriptionData)
            .eq('id', subscriptionId)
            .eq('user_id', dbUserId) // Security check
            .select()
            .single();

          if (error) {
            console.error(`[PATH] Error updating subscription ${subscriptionId}:`, error);
            return res.status(500).json({ error: 'Failed to update subscription' });
          }
          
          return res.status(200).json({ success: true, subscription: data });

        } else if (req.method === 'DELETE' && isSpecificSubscription) {
          // Delete a subscription
          const { error } = await supabase
            .from('subscriptions')
            .delete()
            .eq('id', subscriptionId)
            .eq('user_id', dbUserId); // Security check

          if (error) {
            console.error(`[PATH] Error deleting subscription ${subscriptionId}:`, error);
            return res.status(500).json({ error: 'Failed to delete subscription' });
          }
          
          return res.status(204).end(); // No content
        } else {
          return res.status(405).json({ error: `Method ${req.method} not allowed for this path` });
        }
      } catch (dbError) {
        console.error('[PATH] Database operation error:', dbError);
        return res.status(500).json({
          error: 'database_operation_error', 
          message: dbError.message,
          details: {
            stack: dbError.stack,
            supabase_url_defined: !!supabaseUrl,
            supabase_key_defined: !!supabaseKey,
            env: process.env.NODE_ENV || 'unknown'
          }
        });
      }
    } catch (tokenError) {
      console.error('[PATH] Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error(`[PATH] Top-level handler error:`, error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 