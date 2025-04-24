// Verify Supabase Keys Endpoint
import fetch from 'node-fetch';

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
  
  // Get the keys from the query or from .env
  const anonKey = req.query.anon || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = req.query.service || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  
  // URL from environment
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  if (!supabaseUrl) {
    return res.status(400).json({ error: 'Supabase URL not configured' });
  }
  
  const results = {
    timestamp: new Date().toISOString(),
    supabaseUrl,
    anonKeyTest: null,
    serviceKeyTest: null,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      SUPABASE_URL_SET: !!process.env.SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL_SET: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY_SET: !!process.env.SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY_SET: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_KEY_SET: !!process.env.SUPABASE_SERVICE_KEY,
      SUPABASE_SERVICE_ROLE_KEY_SET: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  };
  
  // Test anon key
  if (anonKey) {
    try {
      const anonResponse = await fetch(`${supabaseUrl}/rest/v1/users?limit=1`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });
      
      results.anonKeyTest = {
        status: anonResponse.status,
        ok: anonResponse.ok
      };
      
      if (anonResponse.ok) {
        const data = await anonResponse.json();
        results.anonKeyTest.data = data;
      } else {
        const text = await anonResponse.text();
        results.anonKeyTest.error = text;
      }
    } catch (error) {
      results.anonKeyTest = {
        error: error.message
      };
    }
  } else {
    results.anonKeyTest = { error: 'No anon key provided' };
  }
  
  // Test service key
  if (serviceKey) {
    try {
      const serviceResponse = await fetch(`${supabaseUrl}/rest/v1/users?limit=1`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });
      
      results.serviceKeyTest = {
        status: serviceResponse.status,
        ok: serviceResponse.ok
      };
      
      if (serviceResponse.ok) {
        const data = await serviceResponse.json();
        results.serviceKeyTest.data = data;
      } else {
        const text = await serviceResponse.text();
        results.serviceKeyTest.error = text;
      }
    } catch (error) {
      results.serviceKeyTest = {
        error: error.message
      };
    }
  } else {
    results.serviceKeyTest = { error: 'No service key provided' };
  }
  
  // If client provided keys in the query string, verify those as well
  if (req.query.anon && req.query.anon !== anonKey) {
    try {
      const customAnonResponse = await fetch(`${supabaseUrl}/rest/v1/users?limit=1`, {
        headers: {
          'apikey': req.query.anon,
          'Authorization': `Bearer ${req.query.anon}`
        }
      });
      
      results.customAnonKeyTest = {
        status: customAnonResponse.status,
        ok: customAnonResponse.ok
      };
      
      if (customAnonResponse.ok) {
        results.customAnonKeyTest.data = await customAnonResponse.json();
      } else {
        results.customAnonKeyTest.error = await customAnonResponse.text();
      }
    } catch (error) {
      results.customAnonKeyTest = {
        error: error.message
      };
    }
  }
  
  if (req.query.service && req.query.service !== serviceKey) {
    try {
      const customServiceResponse = await fetch(`${supabaseUrl}/rest/v1/users?limit=1`, {
        headers: {
          'apikey': req.query.service,
          'Authorization': `Bearer ${req.query.service}`
        }
      });
      
      results.customServiceKeyTest = {
        status: customServiceResponse.status,
        ok: customServiceResponse.ok
      };
      
      if (customServiceResponse.ok) {
        results.customServiceKeyTest.data = await customServiceResponse.json();
      } else {
        results.customServiceKeyTest.error = await customServiceResponse.text();
      }
    } catch (error) {
      results.customServiceKeyTest = {
        error: error.message
      };
    }
  }
  
  return res.status(200).json(results);
} 