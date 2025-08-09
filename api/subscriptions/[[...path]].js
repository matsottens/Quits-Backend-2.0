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
        // Strip any query parameters (e.g., ?%5B...path%5D=...) that Vercel appends
        subscriptionId = urlParts[subsIdx + 1].split('?')[0];
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
        
        // Require an existing user; do not create here to avoid duplicates
        let dbUserId;
        if (!users || users.length === 0) {
          console.log('[PATH] User not found for token subject/email; returning user_not_found');
          return res.status(404).json({
            success: false,
            error: 'user_not_found',
            message: 'User not found. Please re-authenticate to link your Gmail account.'
          });
        } else {
          dbUserId = users[0].id;
          console.log(`[PATH] Found existing user with ID: ${dbUserId}`);
        }
        
        // After user lookup/creation, handle the actual API request method (GET, PUT, POST, DELETE)
        if (req.method === 'GET') {
          if (isSpecificSubscription) {
            // Check if this is an analysis-based subscription ID (analysis_<uuid>)
            if (subscriptionId.startsWith('analysis_')) {
              const analysisId = subscriptionId.replace('analysis_', '');
              console.log(`[PATH] Fetching analysis subscription with ID: ${analysisId}`);
              
              const { data, error } = await supabase
                .from('subscription_analysis')
                .select('*')
                .eq('id', analysisId)
                .eq('user_id', dbUserId)
                .single();

              if (error) {
                console.error(`[PATH] Error fetching analysis subscription ${analysisId}:`, error);
                return res.status(500).json({ error: 'Failed to fetch analysis subscription' });
              }

              if (!data) {
                return res.status(404).json({ error: `Analysis subscription with ID ${subscriptionId} not found` });
              }

              // Format as subscription-like object
              const formattedSubscription = {
                id: subscriptionId,
                name: data.subscription_name,
                price: parseFloat(data.price || 0),
                currency: data.currency || 'USD',
                billing_cycle: data.billing_cycle || 'monthly',
                next_billing_date: data.next_billing_date,
                category: 'auto-detected',
                is_manual: false,
                source_analysis_id: data.id,
                service_provider: data.service_provider,
                confidence_score: data.confidence_score,
                analysis_status: data.analysis_status,
                created_at: data.created_at,
                updated_at: data.updated_at
              };

              return res.status(200).json({ success: true, subscription: formattedSubscription });
            } else {
              // Fetch regular subscription
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
            }

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