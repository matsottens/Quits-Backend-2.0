// Subscription API endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis';

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

console.log(`Supabase URL defined: ${!!supabaseUrl}`);
console.log(`Supabase key defined: ${!!supabaseKey}`);
console.log(`Using SUPABASE_SERVICE_ROLE_KEY: ${!!supabaseServiceRoleKey}`);
console.log(`Using SUPABASE_SERVICE_KEY: ${!!supabaseServiceKey}`);
console.log(`Supabase URL prefix: ${supabaseUrl?.substring(0, 10) || 'undefined'}...`);
console.log(`Supabase key role: ${supabaseKey ? (supabaseKey.includes('role":"service_role') ? 'service_role' : 'anon') : 'undefined'}`);

const supabase = createClient(supabaseUrl, supabaseKey); 

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for subscription');
    return res.status(204).end();
  }
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  // Log environment details
  console.log('Environment variables check:');
  console.log(`SUPABASE_URL defined: ${!!process.env.SUPABASE_URL}`);
  console.log(`SUPABASE_ANON_KEY defined: ${!!process.env.SUPABASE_ANON_KEY}`);
  console.log(`SUPABASE_SERVICE_KEY defined: ${!!process.env.SUPABASE_SERVICE_KEY}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`VERCEL_ENV: ${process.env.VERCEL_ENV}`);

  try {
    // Handle different HTTP methods
    if (req.method === 'GET') {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Verify the token
      try {
        const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
        if (!jwtSecret) {
          throw new Error('JWT_SECRET environment variable is not set');
        }
        
        const decoded = verify(token, jwtSecret);
        const userId = decoded.id || decoded.sub; // Use sub as fallback (common in JWT)
        
        if (!userId) {
          return res.status(401).json({ error: 'Invalid user ID in token' });
        }
        
        console.log(`Fetching subscriptions for user: ${userId}`);
        
        try {
          // First, we need to look up the database user ID using google_id or email
          // This is a workaround for the UUID type mismatch
          const userLookupResponse = await fetch(
            `${supabaseUrl}/rest/v1/users?select=id,email,google_id&or=(email.eq.${encodeURIComponent(decoded.email)},google_id.eq.${encodeURIComponent(userId)})`, 
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
            console.error('User lookup failed:', errorText);
            
            // Return empty data instead of mock data when user lookup fails
            console.log('User lookup failed, returning empty subscriptions array');
            return res.status(200).json({
              success: true,
              subscriptions: [],
              meta: {
                total: 0,
                totalMonthly: 0,
                totalYearly: 0,
                totalAnnualized: 0,
                lookup_failed: true
              }
            });
          }
          
          const users = await userLookupResponse.json();
          
          // Create a new user if not found
          let dbUserId;
          if (!users || users.length === 0) {
            console.log(`User not found in database, creating new user for: ${decoded.email}`);
            
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
              console.error('Failed to create user:', errorText);
              throw new Error(`Failed to create user: ${errorText}`);
            }
            
            const newUser = await createUserResponse.json();
            dbUserId = newUser[0].id;
            console.log(`Created new user with ID: ${dbUserId}`);

            // Extract Gmail token from JWT token for email reading
            const gmailToken = decoded.gmail_token;
            
            if (gmailToken) {
              console.log('Gmail token found in JWT, starting email reading process for new user');
              
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
                  console.log(`Created scan record with ID: ${scanRecord[0].id}`);
                  
                  // Set up Gmail API
                  const oauth2Client = new google.auth.OAuth2();
                  oauth2Client.setCredentials({ access_token: gmailToken });
                  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                  
                  // Search for subscription-related emails
                  const query = 'subject:(subscription OR receipt OR invoice OR payment OR billing OR renewal)';
                  console.log(`Searching emails with query: ${query}`);
                  
                  const messageList = await gmail.users.messages.list({
                    userId: 'me',
                    maxResults: 50,
                    q: query
                  });
                  
                  const messages = messageList.data.messages || [];
                  console.log(`Found ${messages.length} potential subscription emails`);
                  
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
                        console.error(`Failed to store email data for message ${message.id}:`, await emailDataResponse.text());
                      } else {
                        console.log(`Stored email data for message ${message.id}`);
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
                      console.log(`Processed email ${processedCount}/${messages.length}: ${subject}`);
                      
                    } catch (emailError) {
                      console.error(`Error processing email ${message.id}:`, emailError);
                    }
                  }
                  
                  // Mark scan as completed
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
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                      })
                    }
                  );
                  
                  console.log(`Email reading completed for new user. Processed ${processedCount} emails.`);
                  
                  // Trigger Gemini analysis of the emails
                  if (processedCount > 0) {
                    console.log('Triggering Gemini analysis of emails...');
                    try {
                      // Construct the correct API URL
                      let apiBaseUrl;
                      if (process.env.VERCEL_URL) {
                        // Vercel provides URL without protocol, add https://
                        apiBaseUrl = `https://${process.env.VERCEL_URL}`;
                      } else {
                        // Fallback to production API
                        apiBaseUrl = 'https://api.quits.cc';
                      }
                      
                      const analysisResponse = await fetch(`${apiBaseUrl}/api/analyze-emails`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                          scan_id: scanRecord[0].scan_id
                        })
                      });
                      
                      if (analysisResponse.ok) {
                        const analysisResult = await analysisResponse.json();
                        console.log('Gemini analysis triggered successfully:', analysisResult);
                      } else {
                        console.error('Failed to trigger Gemini analysis:', await analysisResponse.text());
                      }
                    } catch (analysisError) {
                      console.error('Error triggering Gemini analysis:', analysisError);
                    }
                  }
                  
                } else {
                  console.error('Failed to create scan record:', await scanRecordResponse.text());
                }
                
              } catch (emailReadingError) {
                console.error('Error during email reading process:', emailReadingError);
                // Continue with user creation even if email reading fails
              }
            } else {
              console.log('No Gmail token provided, skipping email reading for new user');
            }

            // Create welcome subscription for new user
            try {
              const { error: subError } = await supabase
                .from('subscriptions')
                .insert({
                  user_id: dbUserId,
                  name: 'Welcome Subscription',
                  price: 0,
                  billing_cycle: 'monthly',
                  next_billing_date: null,
                  category: 'welcome',
                  is_manual: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              console.log('Mock subscription created for new user:', decoded.email);
            } catch (e) {
              console.error('Failed to create mock subscription for new user:', e);
            }
          } else {
            dbUserId = users[0].id;
            console.log(`Found existing user with ID: ${dbUserId}`);
          }
          
          // Now fetch subscriptions with the correct UUID
          const response = await fetch(
            `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${dbUserId}&select=*`, 
            {
              method: 'GET',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('Supabase API response status:', response.status);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Supabase API error:', errorText);
            throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
          }
          
          const subscriptions = await response.json();
          console.log(`Found ${subscriptions.length} subscriptions for user ${dbUserId}`);
          
          // For now, if no subscriptions are found, return mock data to prevent empty state
          if (!subscriptions || subscriptions.length === 0) {
            console.log('No subscriptions found, returning empty array');
            return res.status(200).json({
              success: true,
              subscriptions: [],
              meta: {
                total: 0,
                totalMonthly: 0,
                totalYearly: 0,
                totalAnnualized: 0,
                db_user_id: dbUserId
              }
            });
          }
          
          // Calculate subscription metrics
          const monthlyTotal = subscriptions
            .filter(sub => sub.billing_cycle === 'monthly')
            .reduce((sum, sub) => sum + parseFloat(sub.price || 0), 0);
            
          const yearlyTotal = subscriptions
            .filter(sub => sub.billing_cycle === 'yearly')
            .reduce((sum, sub) => sum + parseFloat(sub.price || 0), 0);
            
          const annualizedCost = monthlyTotal * 12 + yearlyTotal;
          
          // Map database field names to frontend expected format
          const formattedSubscriptions = subscriptions.map(sub => ({
            id: sub.id,
            name: sub.name,
            price: parseFloat(sub.price || 0),
            billingCycle: sub.billing_cycle,
            nextBillingDate: sub.next_billing_date,
            category: sub.category || 'other',
            is_manual: sub.is_manual || false,
            createdAt: sub.created_at,
            updatedAt: sub.updated_at
          }));
          
          return res.status(200).json({
            success: true,
            subscriptions: formattedSubscriptions,
            meta: {
              total: subscriptions.length,
              totalMonthly: monthlyTotal,
              totalYearly: yearlyTotal,
              totalAnnualized: annualizedCost,
              currency: 'USD',  // Default currency or fetch from user preferences
              db_user_id: dbUserId
            }
          });
        } catch (dbError) {
          console.error('Database operation error:', dbError);
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
        console.error('Token verification error:', tokenError);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } else if (req.method === 'POST') {
      // Handle POST requests similarly with modifications for UUID compatibility
      // Extract and verify token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
      const decoded = verify(token, jwtSecret);
      const userId = decoded.id || decoded.sub;
      
      if (!userId) {
        return res.status(401).json({ error: 'Invalid user ID in token' });
      }
      
      // Extract subscription data from request body
      const subscriptionData = req.body;
      
      // Validate required fields
      if (!subscriptionData.name || !subscriptionData.price || !subscriptionData.billingCycle) {
        return res.status(400).json({ 
          error: 'invalid_input', 
          message: 'Missing required fields (name, price, billingCycle)'
        });
      }
      
      try {
        // First, we need to look up the database user ID using google_id or email
        const userLookupResponse = await fetch(
          `${supabaseUrl}/rest/v1/users?select=id,email,google_id&or=(email.eq.${encodeURIComponent(decoded.email)},google_id.eq.${encodeURIComponent(userId)})`, 
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
          console.error('User lookup failed:', errorText);
          throw new Error(`User lookup failed: ${errorText}`);
        }
        
        const users = await userLookupResponse.json();
        
        // Create a new user if not found
        let dbUserId;
        if (!users || users.length === 0) {
          console.log(`User not found in database, creating new user for: ${decoded.email}`);
          
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
            console.error('Failed to create user:', errorText);
            throw new Error(`Failed to create user: ${errorText}`);
          }
          
          const newUser = await createUserResponse.json();
          dbUserId = newUser[0].id;
          console.log(`Created new user with ID: ${dbUserId}`);
        } else {
          dbUserId = users[0].id;
          console.log(`Found existing user with ID: ${dbUserId}`);
        }
        
        // Create subscription using direct REST API with the correct UUID
        const response = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions`, 
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              user_id: dbUserId,
              name: subscriptionData.name,
              price: subscriptionData.price,
              billing_cycle: subscriptionData.billingCycle,
              next_billing_date: subscriptionData.nextBillingDate,
              category: subscriptionData.category || 'other',
              is_manual: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error creating subscription:', errorText);
          throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
      return res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
          subscription: data[0],
          db_user_id: dbUserId
        });
      } catch (error) {
        console.error('Error creating subscription:', error);
        return res.status(500).json({ 
          error: 'database_error', 
          message: 'Failed to create subscription',
          details: error.message
        });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 