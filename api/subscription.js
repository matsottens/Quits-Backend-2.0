// Subscription API endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
import { analyzeEmailsForUser } from './gemini-analysis-utils.js';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

// NOTE: We must NOT reference `req` before the handler is invoked, because `req` is only
// available at runtime. Define helpers that can compute the appropriate auth headers once
// we have the request object.
const buildAuthHeaders = (req) => {
  // Always use the service-role key when available so that RLS policies do not
  // block access.  We authenticate the caller separately with verify(token)
  // below, so it’s safe to query with elevated privileges here.

  const AUTH_HEADER = supabaseKey
    ? `Bearer ${supabaseKey}`
    : (req.headers && req.headers.authorization ? req.headers.authorization : '');

  // Use service-role key for inserts if we have it; otherwise fall back to caller JWT
  const INSERT_AUTH = supabaseKey && supabaseKey.includes('service_role')
    ? `Bearer ${supabaseKey}`
    : (req.headers && req.headers.authorization ? req.headers.authorization : AUTH_HEADER);

  return { AUTH_HEADER, INSERT_AUTH };
};

console.log(`Supabase URL defined: ${!!supabaseUrl}`);
console.log(`Supabase key defined: ${!!supabaseKey}`);
console.log(`Using SUPABASE_SERVICE_ROLE_KEY: ${!!supabaseServiceRoleKey}`);
console.log(`Using SUPABASE_SERVICE_KEY: ${!!supabaseServiceKey}`);
console.log(`Supabase URL prefix: ${supabaseUrl?.substring(0, 10) || 'undefined'}...`);
console.log(`Supabase key role: ${supabaseKey ? (supabaseKey.includes('role":"service_role') ? 'service_role' : 'anon') : 'undefined'}`);

const supabase = createClient(supabaseUrl, supabaseKey); 

export default async function handler(req, res) {
  // Build request-scoped auth headers (cannot do this at module scope)
  const { AUTH_HEADER, INSERT_AUTH } = buildAuthHeaders(req);

  // Set CORS headers for all response types
  const origin = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5173' 
    : 'https://www.quits.cc';
  res.setHeader('Access-Control-Allow-Origin', origin);
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
            `${supabaseUrl}/rest/v1/users?select=id,email,google_id&or=(email.eq.${encodeURIComponent(decoded.email)},google_id.eq.${encodeURIComponent(userId)},id.eq.${encodeURIComponent(userId)})`, 
            {
              method: 'GET',
              headers: {
                'apikey': supabaseKey,
                'Authorization': AUTH_HEADER,
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
          
          // Require an existing user; do not create here to avoid duplicates
          let dbUserId;
          if (!users || users.length === 0) {
            console.log('User not found for token subject/email; returning user_not_found');
            return res.status(404).json({
              success: false,
              error: 'user_not_found',
              message: 'User not found. Please re-authenticate to link your Gmail account.'
            });
          } else {
            dbUserId = users[0].id;
            console.log(`Found existing user with ID: ${dbUserId}`);
          }
          
          // Fetch manual and auto-detected subscriptions from subscriptions table
          const subscriptionsResponse = await fetch(
            `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${dbUserId}&select=*`,
            {
              method: 'GET',
              headers: {
                'apikey': supabaseKey,
                'Authorization': AUTH_HEADER,
                'Content-Type': 'application/json'
              }
            }
          );

          let subscriptions = [];
          if (subscriptionsResponse.ok) {
            subscriptions = await subscriptionsResponse.json();
            console.log(`Found ${subscriptions.length} subscriptions for user ${dbUserId}`);
          }

          // Fetch auto-detected subscriptions from analysis results (pattern-matching)
          let analysisSubscriptions = [];
          // Only include Gemini-completed analysis items
          const analysisResponse = await fetch(
            `${supabaseUrl}/rest/v1/subscription_analysis?user_id=eq.${dbUserId}&analysis_status=eq.completed&select=*`,
            {
              method: 'GET',
              headers: {
                'apikey': supabaseKey,
                'Authorization': AUTH_HEADER,
                'Content-Type': 'application/json'
              }
            }
          );
          if (analysisResponse.ok) {
            analysisSubscriptions = await analysisResponse.json();
            console.log(`Found ${analysisSubscriptions.length} auto-detected subscriptions from analysis (completed + pending)`);
          }

          // Determine if there are any Gemini (auto-detected) subscriptions
          const geminiSubscriptions = subscriptions.filter(sub => !sub.is_manual && (sub.category === 'auto-detected' || sub.source === 'gemini'));
          let allSubscriptions;
          if (geminiSubscriptions.length > 0) {
            // Use only manual + Gemini subscriptions
            allSubscriptions = [
              ...subscriptions.map(sub => ({ ...sub, source: sub.is_manual ? 'manual' : 'gemini' }))
            ];
            console.log(`Using only subscriptions table (manual + gemini). Gemini count: ${geminiSubscriptions.length}`);
          } else {
            // Use manual + pattern-matching (analysis) subscriptions
            allSubscriptions = [
              ...subscriptions.map(sub => ({ ...sub, source: 'manual' })),
              ...analysisSubscriptions.map(analysis => ({
                id: `analysis_${analysis.id}`,
                name: analysis.subscription_name,
                price: parseFloat(analysis.price || 0),
                currency: analysis.currency || 'USD',
                billing_cycle: analysis.billing_cycle || 'monthly',
                next_billing_date: analysis.next_billing_date,
                service_provider: analysis.service_provider,
                category: 'auto-detected',
                is_manual: false,
                source: 'email_scan',
                source_analysis_id: analysis.id,
                confidence_score: analysis.confidence_score,
                analysis_status: analysis.analysis_status,
                created_at: analysis.created_at,
                updated_at: analysis.updated_at
              }))
            ];
            console.log(`Using subscriptions table (manual) + pattern-matching analysis results. Analysis count: ${analysisSubscriptions.length}`);
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
            price: parseFloat(sub.price || 0),
            billingCycle: sub.billing_cycle,
            nextBillingDate: sub.next_billing_date,
            category: sub.category || 'other',
            is_manual: sub.is_manual || false,
            source_analysis_id: sub.source_analysis_id,
            service_provider: sub.service_provider,
            confidence_score: sub.confidence_score,
            analysis_status: sub.analysis_status, // Include analysis status for frontend
            is_pending: sub.analysis_status === 'pending', // Flag for pending analysis
            createdAt: sub.created_at,
            updatedAt: sub.updated_at
          }));
          
          return res.status(200).json({
            success: true,
            subscriptions: formattedSubscriptions,
            meta: {
              total: allSubscriptions.length,
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
        // Build dynamic OR filter similar to path handler
        const filters2 = [`email.eq.${encodeURIComponent(decoded.email)}`];
        if (userId && /^[0-9a-fA-F-]{36}$/.test(userId)) {
          filters2.push(`id.eq.${encodeURIComponent(userId)}`);
          filters2.push(`google_id.eq.${encodeURIComponent(userId)}`);
        }
        const userLookupResponse = await fetch(
          `${supabaseUrl}/rest/v1/users?select=id,email,google_id&or=(${filters2.join(',')})`, 
          {
            method: 'GET',
            headers: {
              'apikey': supabaseKey,
              'Authorization': AUTH_HEADER,
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
        
        // Require an existing user; do not create here to avoid duplicates
        let dbUserId;
        if (!users || users.length === 0) {
          console.log('User not found for token subject/email; returning user_not_found');
          return res.status(404).json({
            success: false,
            error: 'user_not_found',
            message: 'User not found. Please re-authenticate to link your Gmail account.'
          });
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
              'Authorization': AUTH_HEADER,
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