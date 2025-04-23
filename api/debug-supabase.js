// Debug endpoint to test Supabase connection
import fetch from 'node-fetch';

/**
 * Debug endpoint for testing Supabase connection
 * 
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  const results = {
    success: false,
    error: null,
    env: {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'Not set',
      supabaseAnonKeySet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
      supabaseServiceKeySet: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      // Only show first few chars of keys for security
      supabaseAnonKeyPrefix: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').substring(0, 5) + '...',
      supabaseServiceKeyPrefix: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').substring(0, 5) + '...',
      nodeEnv: process.env.NODE_ENV
    },
    supabaseHealth: null,
    serviceKeyTest: {
      status: null,
      body: null,
      error: null
    },
    anonKeyTest: {
      status: null,
      body: null,
      error: null
    }
  };

  try {
    // Validate Supabase URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('Supabase URL not set in environment variables');
    }

    // Check Supabase health
    try {
      const healthResponse = await fetch(`${supabaseUrl}/health`);
      results.supabaseHealth = {
        status: healthResponse.status,
        ok: healthResponse.ok
      };
      
      if (healthResponse.ok) {
        results.supabaseHealth.body = await healthResponse.json();
      }
    } catch (error) {
      results.supabaseHealth = {
        error: error.message
      };
    }

    // Test with service role key
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      try {
        const serviceResponse = await fetch(`${supabaseUrl}/rest/v1/users?select=id,email&limit=1`, {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
          }
        });
        
        results.serviceKeyTest.status = serviceResponse.status;
        
        if (serviceResponse.ok) {
          const data = await serviceResponse.json();
          results.serviceKeyTest.body = data;
        } else {
          results.serviceKeyTest.body = await serviceResponse.text();
        }
      } catch (error) {
        results.serviceKeyTest.error = error.message;
      }
    }

    // Test with anon key
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (anonKey) {
      try {
        const anonResponse = await fetch(`${supabaseUrl}/rest/v1/public_data?select=*&limit=1`, {
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`
          }
        });
        
        results.anonKeyTest.status = anonResponse.status;
        
        if (anonResponse.ok) {
          const data = await anonResponse.json();
          results.anonKeyTest.body = data;
        } else {
          results.anonKeyTest.body = await anonResponse.text();
        }
      } catch (error) {
        results.anonKeyTest.error = error.message;
      }
    }

    // Set success if we could at least reach the Supabase health endpoint
    results.success = results.supabaseHealth && results.supabaseHealth.ok;
  } catch (error) {
    results.error = error.message;
  }

  res.status(200).json(results);
} 