// Manual subscription endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  console.log('MANUAL-SUB: Endpoint called with method', req.method);
  
  // We only want POST requests for creating subscriptions
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', message: 'Only POST method is allowed' });
  }
  
  try {
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
      
      // Log environment variables to help with debugging
      console.log('MANUAL-SUB: Environment variables check:');
      console.log(`MANUAL-SUB: SUPABASE_URL defined: ${!!process.env.SUPABASE_URL}`);
      console.log(`MANUAL-SUB: SUPABASE_ANON_KEY defined: ${!!process.env.SUPABASE_ANON_KEY}`);
      console.log(`MANUAL-SUB: SUPABASE_SERVICE_KEY defined: ${!!process.env.SUPABASE_SERVICE_KEY}`);
      
      // Look up the database user ID
      console.log(`MANUAL-SUB: Looking up user with ID: ${userId}`);
      
      const userLookupResponse = await fetch(
        `${supabaseUrl}/rest/v1/users?select=id,email&or=(email.eq.${encodeURIComponent(decoded.email)},google_id.eq.${encodeURIComponent(userId)})`, 
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
        console.error(`MANUAL-SUB: User lookup failed: ${errorText}`);
        return res.status(500).json({ error: 'user_lookup_failed', message: 'Failed to look up user', details: errorText });
      }
      
      const users = await userLookupResponse.json();
      
      // Verify user exists
      if (!users || users.length === 0) {
        console.error(`MANUAL-SUB: User not found in database for email: ${decoded.email}`);
        
        // Try to create the user
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
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          }
        );
        
        if (!createUserResponse.ok) {
          const errorText = await createUserResponse.text();
          console.error(`MANUAL-SUB: User creation failed: ${errorText}`);
          return res.status(500).json({ error: 'user_creation_failed', message: 'Failed to create user', details: errorText });
        }
        
        const newUser = await createUserResponse.json();
        var dbUserId = newUser[0].id;
        console.log(`MANUAL-SUB: Created new user with ID: ${dbUserId}`);
      } else {
        var dbUserId = users[0].id;
        console.log(`MANUAL-SUB: Found existing user with ID: ${dbUserId}`);
      }
      
      // Get subscription data from request body
      let subscriptionData;
      try {
        subscriptionData = req.body;
        
        // Validate required fields
        if (!subscriptionData.name) {
          return res.status(400).json({ error: 'missing_name', message: 'Subscription name is required' });
        }
      } catch (parseError) {
        console.error('MANUAL-SUB: Error parsing request body:', parseError);
        return res.status(400).json({ error: 'invalid_request_body', message: 'Invalid request body format' });
      }
      
      // Create default subscription data from what was provided
      const subscription = {
        user_id: dbUserId,
        name: subscriptionData.name,
        price: subscriptionData.price || 0,
        currency: subscriptionData.currency || 'USD',
        billing_cycle: subscriptionData.billing_cycle || 'monthly',
        next_billing_date: subscriptionData.next_billing_date || new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
        provider: subscriptionData.provider || '',
        category: subscriptionData.category || '',
        is_manual: true,
        notes: subscriptionData.notes || '',
        source: 'manual',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      console.log('MANUAL-SUB: Creating subscription:', subscription);
      
      // Create subscription in the database
      const createSubResponse = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(subscription)
        }
      );
      
      if (!createSubResponse.ok) {
        const errorText = await createSubResponse.text();
        console.error(`MANUAL-SUB: Subscription creation failed: ${errorText}`);
        return res.status(500).json({ error: 'subscription_creation_failed', message: 'Failed to create subscription', details: errorText });
      }
      
      const newSubscription = await createSubResponse.json();
      console.log(`MANUAL-SUB: Created new subscription with ID: ${newSubscription[0].id}`);
      
      return res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        subscription: newSubscription[0]
      });
    } catch (tokenError) {
      console.error('MANUAL-SUB: Token verification error:', tokenError);
      return res.status(401).json({ error: 'invalid_token', message: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('MANUAL-SUB: General error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 