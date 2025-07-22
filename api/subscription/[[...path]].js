// Catch-all handler for subscription endpoints
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
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

// Helper function to check if Gemini AI scanning is available
const isGeminiScanningAvailable = () => {
  return !!process.env.GEMINI_API_KEY;
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
          
          // Return mock data for now
        return res.status(200).json({
          success: true,
          subscriptions: [
            {
                id: 'mock_sub_123',
                name: 'Netflix (Path Handler - User Lookup Failed)',
              price: 15.99,
                billingCycle: 'monthly',
                nextBillingDate: '2023-05-15',
              category: 'entertainment',
                is_manual: true
            },
            {
                id: 'mock_sub_124',
                name: 'Spotify (Path Handler - User Lookup Failed)',
              price: 9.99,
                billingCycle: 'monthly',
                nextBillingDate: '2023-05-10',
              category: 'music',
                is_manual: true
              }
            ],
            meta: {
              total: 2,
              totalMonthly: 25.98,
              totalYearly: 0,
              totalAnnualized: 311.76,
              mock_data: true,
              source: 'path_handler',
              lookup_failed: true
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
            throw new Error(`Failed to create user: ${errorText}`);
          }
          
          const newUser = await createUserResponse.json();
          dbUserId = newUser[0].id;
          console.log(`[PATH] Created new user with ID: ${dbUserId}`);
        } else {
          dbUserId = users[0].id;
          console.log(`[PATH] Found existing user with ID: ${dbUserId}`);
        }
        
        // Handle different HTTP methods
        if (req.method === 'GET') {
          // For specific subscription
          if (isSpecificSubscription) {
            console.log(`[PATH] Fetching subscription ${subscriptionId} for user ${dbUserId}`);
            
            try {
              const response = await fetch(
                `${supabaseUrl}/rest/v1/subscriptions?id=eq.${subscriptionId}&user_id=eq.${dbUserId}&select=*`, 
                {
                  method: 'GET',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
              }
              
              const subscriptions = await response.json();
              
              if (!subscriptions || subscriptions.length === 0) {
                return res.status(404).json({ 
                  error: 'not_found', 
                  message: 'Subscription not found' 
                });
              }
              
              // Format the subscription data – keep DB column names intact
              const s = subscriptions[0];
              const formattedSubscription = {
                // UUID & core info
                id: s.id,
                name: s.name,

                // Pricing
                price: Number(s.price),
                billing_cycle: s.billing_cycle,           // snake_case preferred by frontend
                billingCycle: s.billing_cycle,            // camelCase fallback
                monthly_cost: s.monthly_cost ?? null,

                // Dates
                next_billing_date: s.next_billing_date,
                nextBillingDate: s.next_billing_date,
                start_date: s.start_date,
                end_date: s.end_date,

                // Categorisation
                provider: s.provider,
                category: s.category || 'other',

                // Flags / meta
                is_manual: s.is_manual || false,
                created_at: s.created_at,
                updated_at: s.updated_at
              };
              
              return res.status(200).json({
                success: true,
                subscription: formattedSubscription
              });
            } catch (error) {
              console.error('[PATH] Error fetching specific subscription:', error);
              return res.status(500).json({
                error: 'database_error',
                message: 'Error fetching subscription',
                details: error.message
              });
            }
          } 
          // For all subscriptions
          else {
            console.log(`[PATH] Fetching all subscriptions for user ${dbUserId}`);
            
            try {
              // Check for scan request parameter
              const shouldScan = req.query.scan === 'true';
              const gmailToken = decoded.gmail_token;
              
              // If scan is requested and we have a Gmail token, initiate a background scan
              if (shouldScan && gmailToken && isGeminiScanningAvailable()) {
                console.log('[PATH] Initiating background email scan for subscriptions');
                
                // Call the scan-subscriptions endpoint in the background
                fetch(`${process.env.API_BASE_URL || 'https://api.quits.cc'}/scan-subscriptions`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ background: true })
                }).catch(error => {
                  console.error('[PATH] Error initiating background scan:', error);
                });
              }
              
              // Fetch manual subscriptions from subscriptions table
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
              
              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
              }
              
              const subscriptions = await response.json();
              console.log(`[PATH] Found ${subscriptions.length} manual subscriptions for user ${dbUserId}`);
              
              // Also fetch auto-detected subscriptions from analysis results
              const analysisResponse = await fetch(
                `${supabaseUrl}/rest/v1/subscription_analysis?user_id=eq.${dbUserId}&analysis_status=eq.completed&select=*`,
                {
                  method: 'GET',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              let analysisSubscriptions = [];
              if (analysisResponse.ok) {
                analysisSubscriptions = await analysisResponse.json();
                console.log(`[PATH] Found ${analysisSubscriptions.length} auto-detected subscriptions from analysis`);
              }
              
              // If no analysis results yet, wait a bit and retry (for new users)
              if (analysisSubscriptions.length === 0 && subscriptions.length === 0) {
                console.log('[PATH] No subscriptions found, waiting for analysis to complete...');
                
                // Wait 5 seconds for analysis to complete
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Retry fetching analysis results
                const retryAnalysisResponse = await fetch(
                  `${supabaseUrl}/rest/v1/subscription_analysis?user_id=eq.${dbUserId}&analysis_status=eq.completed&select=*`,
                  {
                    method: 'GET',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );
                
                if (retryAnalysisResponse.ok) {
                  analysisSubscriptions = await retryAnalysisResponse.json();
                  console.log(`[PATH] After retry: Found ${analysisSubscriptions.length} auto-detected subscriptions from analysis`);
                }
              }
              
              // Combine manual subscriptions and auto-detected ones
              const allSubscriptions = [...subscriptions];
              
              // Add auto-detected subscriptions that aren't already in the subscriptions table
              for (const analysis of analysisSubscriptions) {
                const alreadyExists = subscriptions.some(sub => sub.name === analysis.subscription_name);
                if (!alreadyExists) {
                  console.log(`[PATH] Adding analysis subscription: ${analysis.subscription_name} (price: ${analysis.price}, billing: ${analysis.billing_cycle})`);
                  allSubscriptions.push({
                    id: `analysis_${analysis.id}`,
                    name: analysis.subscription_name,
                    price: analysis.price || 0,
                    billing_cycle: analysis.billing_cycle || 'monthly',
                    next_billing_date: analysis.next_billing_date,
                    category: 'auto-detected',
                    is_manual: false,
                    source_analysis_id: analysis.id,
                    service_provider: analysis.service_provider,
                    confidence_score: analysis.confidence_score,
                    created_at: analysis.created_at,
                    updated_at: analysis.updated_at
                  });
                } else {
                  console.log(`[PATH] Skipping analysis subscription (already exists): ${analysis.subscription_name}`);
                }
              }
              
              console.log(`[PATH] Total subscriptions (manual + auto-detected): ${allSubscriptions.length}`);
              
              // If no subscriptions are found, return suggestion to scan emails
              if (!allSubscriptions || allSubscriptions.length === 0) {
                console.log('[PATH] No subscriptions found');
                
                // Check if we can offer email scanning
                if (isGeminiScanningAvailable() && gmailToken) {
                  console.log('[PATH] Suggesting email scanning with Gemini AI');
                  return res.status(200).json({
                    success: true,
                    subscriptions: [],
                    meta: {
                      total: 0,
                      totalMonthly: 0,
                      totalYearly: 0,
                      totalAnnualized: 0,
                      source: 'path_handler',
                      can_scan_emails: true,
                      db_user_id: dbUserId,
                      message: 'No subscriptions found. Email analysis may still be in progress.'
                    }
                  });
                }
                
                // If no scanning available, return empty array
                return res.status(200).json({
                  success: true,
                  subscriptions: [],
                  meta: {
                    total: 0,
                    totalMonthly: 0,
                    totalYearly: 0,
                    totalAnnualized: 0,
                    source: 'path_handler',
                    can_scan_emails: false,
                    db_user_id: dbUserId,
                    message: 'No subscriptions found. Email analysis may still be in progress.'
                  }
                });
              }
              
              // Calculate subscription metrics
              const monthlyTotal = allSubscriptions
                .filter(sub => sub.billing_cycle === 'monthly')
                .reduce((sum, sub) => sum + parseFloat(sub.price || 0), 0);
                
              const yearlyTotal = allSubscriptions
                .filter(sub => sub.billing_cycle === 'yearly')
                .reduce((sum, sub) => sum + parseFloat(sub.price || 0), 0);
                
              const annualizedCost = monthlyTotal * 12 + yearlyTotal;
              
              // Map database field names to frontend expected format
              const formattedSubscriptions = allSubscriptions.map(sub => ({
                id: sub.id,
                name: sub.name,
                price: Number(sub.price || 0),
                billing_cycle: sub.billing_cycle,
                billingCycle: sub.billing_cycle,  // camelCase backup
                next_billing_date: sub.next_billing_date,
                nextBillingDate: sub.next_billing_date,
                provider: sub.provider,
                category: sub.category || 'other',
                start_date: sub.start_date,
                end_date: sub.end_date,
                monthly_cost: sub.monthly_cost ?? null,
                is_manual: sub.is_manual || false,
                is_detected: sub.source === 'email_scan' || (sub.id && String(sub.id).startsWith('analysis_')),
                confidence: sub.confidence_score,
                created_at: sub.created_at,
                updated_at: sub.updated_at
              }));
              
              return res.status(200).json({
                success: true,
                subscriptions: formattedSubscriptions,
                meta: {
                  total: allSubscriptions.length,
                  totalMonthly: monthlyTotal,
                  totalYearly: yearlyTotal,
                  totalAnnualized: annualizedCost,
                  currency: 'USD',
                  source: 'path_handler',
                  db_user_id: dbUserId,
                  can_scan_emails: !!(isGeminiScanningAvailable() && gmailToken),
                  auto_detected_count: allSubscriptions.filter(sub => !sub.is_manual).length,
                  manual_count: allSubscriptions.filter(sub => sub.is_manual).length
                }
              });
            } catch (error) {
              console.error('[PATH] Error fetching all subscriptions:', error);
              return res.status(500).json({
                error: 'database_error',
                message: 'Error fetching subscriptions',
                details: error.message
              });
            }
          }
        }
        else if (req.method === 'PUT' || req.method === 'PATCH') {
          // Check if we have a subscription ID
          if (!isSpecificSubscription) {
            return res.status(400).json({ 
              error: 'missing_id', 
              message: 'Subscription ID is required for updates' 
            });
          }
          
          const subscriptionData = req.body;
          
          try {
            // Prepare update data
            const updateData = {
              updated_at: new Date().toISOString()
            };
            
            // Only add fields that are provided
            if (subscriptionData.name) updateData.name = subscriptionData.name;
            if (subscriptionData.price !== undefined) updateData.price = subscriptionData.price;
            if (subscriptionData.billingCycle) updateData.billing_cycle = subscriptionData.billingCycle;
            if (subscriptionData.nextBillingDate) updateData.next_billing_date = subscriptionData.nextBillingDate;
            if (subscriptionData.category) updateData.category = subscriptionData.category;
            
            // Update using REST API
            const response = await fetch(
              `${supabaseUrl}/rest/v1/subscriptions?id=eq.${subscriptionId}&user_id=eq.${dbUserId}`, 
              {
                method: 'PATCH',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation'
                },
                body: JSON.stringify(updateData)
              }
            );
            
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            
            if (!data || data.length === 0) {
              return res.status(404).json({
                error: 'not_found',
                message: 'Subscription not found or user does not have permission'
              });
            }
            
            return res.status(200).json({
              success: true,
              message: 'Subscription updated successfully',
              subscription: data[0]
            });
          } catch (error) {
            console.error('[PATH] Error updating subscription:', error);
            return res.status(500).json({
              error: 'database_error',
              message: 'Failed to update subscription',
              details: error.message
            });
          }
        }
        else if (req.method === 'DELETE') {
          // Check if we have a subscription ID
          if (!isSpecificSubscription) {
            return res.status(400).json({ 
              error: 'missing_id', 
              message: 'Subscription ID is required for deletion' 
            });
          }
          
          try {
            // Delete using REST API
            const response = await fetch(
              `${supabaseUrl}/rest/v1/subscriptions?id=eq.${subscriptionId}&user_id=eq.${dbUserId}`, 
              {
                method: 'DELETE',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
            }
            
            return res.status(200).json({
              success: true,
              message: 'Subscription deleted successfully'
            });
          } catch (error) {
            console.error('[PATH] Error deleting subscription:', error);
            return res.status(500).json({
              error: 'database_error',
              message: 'Failed to delete subscription',
              details: error.message
            });
          }
        }
        else if (req.method === 'POST') {
          // Only allow POST at the collection level, not for a specific subscription
          if (isSpecificSubscription) {
            return res.status(400).json({
              error: 'invalid_request',
              message: 'POST method is not supported for specific subscription ID'
            });
          }
          
          const subscriptionData = req.body;
          
          // Validate required fields
          if (!subscriptionData.name || !subscriptionData.price || !subscriptionData.billingCycle) {
            return res.status(400).json({ 
              error: 'invalid_input', 
              message: 'Missing required fields (name, price, billingCycle)'
            });
          }
          
          try {
            // Create using REST API
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
              throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            
      return res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
              subscription: data[0]
            });
          } catch (error) {
            console.error('[PATH] Error creating subscription:', error);
            return res.status(500).json({
              error: 'database_error',
              message: 'Failed to create subscription',
              details: error.message
            });
          }
        }
        else {
          return res.status(405).json({ error: 'Method not allowed' });
        }
      } catch (dbError) {
        console.error('[PATH] Database operation error:', dbError);
        return res.status(500).json({
          error: 'database_operation_error',
          message: dbError.message,
          details: {
            stack: dbError.stack
          }
        });
      }
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Subscription handler error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 