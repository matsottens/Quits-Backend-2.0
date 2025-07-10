// API endpoint to fetch analyzed subscription data
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
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

    // Get scan_id from query parameters (optional)
    const { scan_id } = req.query;

    console.log(`Fetching analyzed subscriptions for user ${userId}${scan_id ? `, scan ${scan_id}` : ''}`);

    // Build query
    let query = supabase
      .from('subscription_analysis')
      .select(`
        *,
        email_data:email_data_id (
          subject,
          sender,
          date,
          content_preview
        )
      `)
      .eq('user_id', userId)
      .eq('analysis_status', 'completed')
      .not('subscription_name', 'is', null)
      .order('created_at', { ascending: false });

    // Add scan filter if provided
    if (scan_id) {
      query = query.eq('scan_id', scan_id);
    }

    const { data: analyzedSubscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching analyzed subscriptions:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch analyzed subscriptions' });
    }

    // Format the response
    const formattedSubscriptions = analyzedSubscriptions.map(sub => ({
      id: sub.id,
      subscription_name: sub.subscription_name,
      price: parseFloat(sub.price || 0),
      currency: sub.currency || 'USD',
      billing_cycle: sub.billing_cycle,
      next_billing_date: sub.next_billing_date,
      service_provider: sub.service_provider,
      confidence_score: parseFloat(sub.confidence_score || 0),
      email_subject: sub.email_data?.subject,
      email_sender: sub.email_data?.sender,
      email_date: sub.email_data?.date,
      email_preview: sub.email_data?.content_preview,
      created_at: sub.created_at,
      updated_at: sub.updated_at
    }));

    // Calculate totals
    const monthlyTotal = formattedSubscriptions
      .filter(sub => sub.billing_cycle === 'monthly')
      .reduce((sum, sub) => sum + sub.price, 0);

    const yearlyTotal = formattedSubscriptions
      .filter(sub => sub.billing_cycle === 'yearly')
      .reduce((sum, sub) => sum + sub.price, 0);

    const annualizedCost = monthlyTotal * 12 + yearlyTotal;

    console.log(`Found ${formattedSubscriptions.length} analyzed subscriptions`);

    return res.status(200).json({
      success: true,
      subscriptions: formattedSubscriptions,
      meta: {
        total: formattedSubscriptions.length,
        totalMonthly: monthlyTotal,
        totalYearly: yearlyTotal,
        totalAnnualized: annualizedCost,
        currency: 'USD'
      }
    });

  } catch (error) {
    console.error('Error fetching analyzed subscriptions:', error);
    return res.status(500).json({
      error: 'fetch_error',
      message: 'Failed to fetch analyzed subscriptions',
      details: error.message
    });
  }
} 