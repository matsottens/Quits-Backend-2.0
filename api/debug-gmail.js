// Debug Gmail API endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

// Initialize Supabase client if credentials are available
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Helper function to extract Gmail token from JWT
const extractGmailToken = (token) => {
  try {
    const payload = jsonwebtoken.decode(token);
    console.log('JWT payload keys:', Object.keys(payload));
    
    if (payload.gmail_token) {
      console.log('Found gmail_token in JWT');
      return payload.gmail_token;
    }
    
    // Check if token might be in a different field
    if (payload.access_token) {
      console.log('Found access_token in JWT, using as Gmail token');
      return payload.access_token;
    }
    
    console.error('No Gmail token found in JWT, payload:', JSON.stringify(payload, null, 2));
    return null;
  } catch (error) {
    console.error('Error extracting Gmail token:', error);
    return null;
  }
};

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for debug-gmail');
    return res.status(204).end();
  }
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    // Check for GET method
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
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
      const userId = decoded.id || decoded.sub;
      const email = decoded.email;
      
      console.log(`DEBUG-GMAIL: Authenticated user ${email} (ID: ${userId})`);
      
      // Extract Gmail token from JWT
      let gmailToken = extractGmailToken(token);
      
      // Check if we have a Gmail token directly in the request headers as fallback
      if (!gmailToken && req.headers['x-gmail-token']) {
        console.log('Using Gmail token from X-Gmail-Token header');
        gmailToken = req.headers['x-gmail-token'];
      }
      
      if (!gmailToken) {
        return res.status(400).json({
          error: 'gmail_token_missing',
          message: 'No Gmail access token found in your authentication token or request',
          connected: false
        });
      }
      
      // Check if scan_id was provided
      const scanId = req.query.scanId;
      let scanDetails = {};
      let dbError = null;
      
      // If we have Supabase credentials and a scan ID, check the scan status in the database
      if (supabase && scanId) {
        try {
          console.log(`DEBUG-GMAIL: Looking up scan ${scanId} in database`);
          
          // First, find the database user ID
          let dbUserId = null;
          
          if (userId && email) {
            const { data: users, error: userError } = await supabase
              .from('users')
              .select('id')
              .or(`email.eq.${email},google_id.eq.${userId}`)
              .limit(1);
              
            if (userError) {
              console.error(`DEBUG-GMAIL: Error finding user: ${userError.message}`);
              dbError = `User lookup error: ${userError.message}`;
            } else if (users && users.length > 0) {
              dbUserId = users[0].id;
              console.log(`DEBUG-GMAIL: Found user ${dbUserId} in database`);
            }
          }
          
          // Check scan_history table
          const { data: scanData, error: scanError } = await supabase
            .from('scan_history')
            .select('*')
            .eq('scan_id', scanId)
            .limit(1);
            
          if (scanError) {
            console.error(`DEBUG-GMAIL: Error finding scan: ${scanError.message}`);
            
            // Check if the error is because the table doesn't exist
            if (scanError.message.includes('does not exist')) {
              dbError = 'scan_history table does not exist in database';
              
              // Try to check if there's a scans table instead
              try {
                const { data: oldScanData, error: oldScanError } = await supabase
                  .from('scans')
                  .select('*')
                  .eq('id', scanId)
                  .limit(1);
                  
                if (!oldScanError && oldScanData && oldScanData.length > 0) {
                  scanDetails = {
                    found_in_legacy_table: true,
                    scan_data: oldScanData[0]
                  };
                }
              } catch (legacyError) {
                console.error(`DEBUG-GMAIL: Error checking legacy scans table: ${legacyError.message}`);
              }
            } else {
              dbError = `Scan lookup error: ${scanError.message}`;
            }
          } else if (scanData && scanData.length > 0) {
            scanDetails = {
              found: true,
              scan_data: scanData[0]
            };
          } else {
            scanDetails = {
              found: false,
              message: 'Scan ID not found in database'
            };
          }
        } catch (dbLookupError) {
          console.error(`DEBUG-GMAIL: Database lookup error: ${dbLookupError.message}`);
          dbError = `Database error: ${dbLookupError.message}`;
        }
      }
      
      // Test Gmail API connection
      let gmailConnected = false;
      let gmailMessages = [];
      let gmailError = null;
      
      if (gmailToken) {
        try {
          console.log('DEBUG-GMAIL: Testing Gmail API connection');
          const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=5', {
            headers: {
              'Authorization': `Bearer ${gmailToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            gmailConnected = true;
            gmailMessages = data.messages || [];
            console.log(`DEBUG-GMAIL: Successfully connected to Gmail API, found ${gmailMessages.length} messages`);
          } else {
            const errorText = await response.text();
            gmailError = `Gmail API error: ${response.status} ${errorText}`;
            console.error(`DEBUG-GMAIL: ${gmailError}`);
          }
        } catch (gmailApiError) {
          gmailError = `Gmail API exception: ${gmailApiError.message}`;
          console.error(`DEBUG-GMAIL: ${gmailError}`);
        }
      } else {
        gmailError = 'No Gmail token available';
        console.log('DEBUG-GMAIL: No Gmail token available to test connection');
      }
      
      // Respond with diagnostic information
      return res.status(200).json({
        authenticated: true,
        user: {
          id: userId,
          email: email
        },
        tokenInfo: {
          gmail_token_present: !!gmailToken,
          gmail_token_length: gmailToken ? gmailToken.length : 0,
          gmail_token_prefix: gmailToken ? gmailToken.substring(0, 10) + '...' : 'none'
        },
        gmail: {
          connected: gmailConnected,
          messageCount: gmailMessages.length,
          error: gmailError
        },
        database: {
          connected: !!supabase,
          error: dbError,
          scan: scanDetails
        },
        server_time: new Date().toISOString(),
        environment: {
          supabase_url: !!supabaseUrl,
          supabase_key: !!supabaseKey
        }
      });
    } catch (tokenError) {
      console.error('DEBUG-GMAIL: Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('DEBUG-GMAIL: General error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
} 