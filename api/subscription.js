// Subscription API endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

console.log(`Supabase URL defined: ${!!supabaseUrl}`);
console.log(`Supabase key defined: ${!!supabaseKey}`);
console.log(`Supabase URL prefix: ${supabaseUrl?.substring(0, 10) || 'undefined'}...`);
console.log(`Supabase key prefix: ${supabaseKey?.substring(0, 5) || 'undefined'}...`);

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
        const userId = decoded.id;
        
        if (!userId) {
          return res.status(401).json({ error: 'Invalid user ID in token' });
        }
        
        console.log(`Fetching subscriptions for user: ${userId}`);
        
        try {
          // Try direct REST API call to Supabase instead of client library
          if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase URL or API key');
          }
          
          // Using REST API directly with fetch 
          const response = await fetch(
            `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=*`, 
            {
              method: 'GET',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
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
          console.log(`Found ${subscriptions.length} subscriptions for user ${userId}`);
          
          // For now, if no subscriptions are found, return mock data to prevent empty state
          if (!subscriptions || subscriptions.length === 0) {
            console.log('No subscriptions found, returning mock data');
            return res.status(200).json({
              success: true,
              subscriptions: [
                {
                  id: 'mock_sub_123',
                  name: 'Netflix',
                  price: 15.99,
                  billingCycle: 'monthly',
                  nextBillingDate: '2023-05-15',
                  category: 'entertainment',
                  is_manual: true
                },
                {
                  id: 'mock_sub_124',
                  name: 'Spotify',
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
                mock_data: true
              }
            });
          }
          
          // Calculate subscription metrics
          const monthlyTotal = subscriptions
            .filter(sub => sub.billing_cycle === 'monthly')
            .reduce((sum, sub) => sum + parseFloat(sub.price), 0);
            
          const yearlyTotal = subscriptions
            .filter(sub => sub.billing_cycle === 'yearly')
            .reduce((sum, sub) => sum + parseFloat(sub.price), 0);
            
          const annualizedCost = monthlyTotal * 12 + yearlyTotal;
          
          // Map database field names to frontend expected format
          const formattedSubscriptions = subscriptions.map(sub => ({
            id: sub.id,
            name: sub.name,
            price: parseFloat(sub.price),
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
              currency: 'USD'  // Default currency or fetch from user preferences
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
      // Extract and verify token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
      const decoded = verify(token, jwtSecret);
      const userId = decoded.id;
      
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
        // Create subscription using direct REST API
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
              user_id: userId,
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
          subscription: data[0] // Supabase returns an array with the created item
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