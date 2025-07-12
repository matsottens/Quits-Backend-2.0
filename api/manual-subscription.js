// Manual subscription endpoint
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

// Function to normalize service names for better duplicate detection
const normalizeServiceName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // Remove non-alphanumeric characters
    .replace(/\b(inc|llc|ltd|corp|co|company|limited|incorporated)\b/g, '') // Remove company suffixes
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract and verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing_auth', message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (tokenError) {
      console.error('MANUAL-SUB: Token verification error:', tokenError);
      return res.status(401).json({ error: 'invalid_token', message: 'Invalid or expired token' });
    }

    const userId = decoded.id || decoded.sub;
    if (!userId) {
      return res.status(400).json({ error: 'invalid_user', message: 'Invalid user ID in token' });
    }

    // Look up the database user ID
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'config_error', message: 'Missing Supabase configuration' });
    }

    // Look up the database user
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
      console.error('MANUAL-SUB: User lookup failed:', errorText);
      return res.status(500).json({ error: 'user_lookup_failed', message: 'Failed to look up user', details: errorText });
    }

    const users = await userLookupResponse.json();
    let dbUserId;

    if (users && users.length > 0) {
      dbUserId = users[0].id;
      console.log(`MANUAL-SUB: Found existing user with ID: ${dbUserId}`);
    } else {
      // Create a new user if not found
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
        console.error('MANUAL-SUB: User creation failed:', errorText);
        return res.status(500).json({ error: 'user_creation_failed', message: 'Failed to create user', details: errorText });
      }

      const newUser = await createUserResponse.json();
      dbUserId = newUser[0].id;
      console.log(`MANUAL-SUB: Created new user with ID: ${dbUserId}`);
    }

    // Parse subscription data from request body
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

    // Check for duplicates before creating
    const normalizedName = normalizeServiceName(subscriptionData.name);
    console.log(`MANUAL-SUB: Normalized subscription name: "${subscriptionData.name}" -> "${normalizedName}"`);
    
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${dbUserId}&name=ilike.${encodeURIComponent('%' + normalizedName + '%')}`, 
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (checkResponse.ok) {
      const existingSubscriptions = await checkResponse.json();
      if (existingSubscriptions && existingSubscriptions.length > 0) {
        console.log(`MANUAL-SUB: Subscription "${subscriptionData.name}" (normalized: "${normalizedName}") already exists, skipping`);
        console.log(`MANUAL-SUB: Existing subscriptions found:`, existingSubscriptions.map(s => s.name));
        return res.status(409).json({ 
          error: 'duplicate_subscription', 
          message: 'A subscription with this name already exists',
          existing_subscriptions: existingSubscriptions
        });
      }
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
  } catch (error) {
    console.error('MANUAL-SUB: General error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 