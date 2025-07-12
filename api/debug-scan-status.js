// Debug endpoint to check scan status and subscription analysis
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // Extract token from Authorization header
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

    console.log(`DEBUG-SCAN-STATUS: Checking status for user: ${userId}`);

    // Look up the database user ID
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
      return res.status(500).json({ error: 'Failed to lookup user' });
    }

    const users = await userLookupResponse.json();
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dbUserId = users[0].id;
    console.log(`DEBUG-SCAN-STATUS: Database user ID: ${dbUserId}`);

    // Check scan history
    const scanResponse = await fetch(
      `${supabaseUrl}/rest/v1/scan_history?user_id=eq.${dbUserId}&select=*&order=created_at.desc&limit=5`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let scans = [];
    if (scanResponse.ok) {
      scans = await scanResponse.json();
      console.log(`DEBUG-SCAN-STATUS: Found ${scans.length} scans`);
    }

    // Check subscription analysis
    const analysisResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscription_analysis?user_id=eq.${dbUserId}&select=*&order=created_at.desc&limit=10`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let analysis = [];
    if (analysisResponse.ok) {
      analysis = await analysisResponse.json();
      console.log(`DEBUG-SCAN-STATUS: Found ${analysis.length} analysis records`);
    }

    // Check subscriptions
    const subscriptionResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${dbUserId}&select=*&order=created_at.desc&limit=10`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let subscriptions = [];
    if (subscriptionResponse.ok) {
      subscriptions = await subscriptionResponse.json();
      console.log(`DEBUG-SCAN-STATUS: Found ${subscriptions.length} subscriptions`);
    }

    // Group analysis by status
    const analysisByStatus = analysis.reduce((acc, item) => {
      const status = item.analysis_status || 'unknown';
      if (!acc[status]) acc[status] = [];
      acc[status].push(item);
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      user: {
        google_id: userId,
        db_id: dbUserId,
        email: decoded.email
      },
      scans: scans.map(scan => ({
        scan_id: scan.scan_id,
        status: scan.status,
        progress: scan.progress,
        emails_found: scan.emails_found,
        emails_processed: scan.emails_processed,
        subscriptions_found: scan.subscriptions_found,
        created_at: scan.created_at,
        updated_at: scan.updated_at
      })),
      analysis: {
        total: analysis.length,
        by_status: analysisByStatus,
        records: analysis.map(item => ({
          id: item.id,
          subscription_name: item.subscription_name,
          analysis_status: item.analysis_status,
          confidence_score: item.confidence_score,
          price: item.price,
          billing_cycle: item.billing_cycle,
          created_at: item.created_at
        }))
      },
      subscriptions: {
        total: subscriptions.length,
        records: subscriptions.map(sub => ({
          id: sub.id,
          name: sub.name,
          price: sub.price,
          billing_cycle: sub.billing_cycle,
          is_manual: sub.is_manual,
          created_at: sub.created_at
        }))
      }
    });

  } catch (error) {
    console.error('DEBUG-SCAN-STATUS: Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
} 