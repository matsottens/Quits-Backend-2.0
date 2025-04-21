// Subscription API endpoint
import jsonwebtoken from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
const { verify } = jsonwebtoken;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
        
        // Fetch real subscription data from Supabase
        const { data: subscriptions, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId);
          
        if (error) {
          console.error('Database error:', error);
          return res.status(500).json({ 
            error: 'database_error', 
            message: 'Error fetching subscriptions from database',
            details: process.env.NODE_ENV === 'production' ? undefined : error.message
          });
        }
        
        // Calculate subscription metrics
        const monthlyTotal = subscriptions
          .filter(sub => sub.billing_cycle === 'monthly')
          .reduce((sum, sub) => sum + sub.price, 0);
          
        const yearlyTotal = subscriptions
          .filter(sub => sub.billing_cycle === 'yearly')
          .reduce((sum, sub) => sum + sub.price, 0);
          
        const annualizedCost = monthlyTotal * 12 + yearlyTotal;
        
        // Map database field names to frontend expected format if needed
        const formattedSubscriptions = subscriptions.map(sub => ({
          id: sub.id,
          name: sub.name,
          price: sub.price,
          billingCycle: sub.billing_cycle,
          nextBillingDate: sub.next_payment_date,
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
      
      // Create subscription in database
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          name: subscriptionData.name,
          price: subscriptionData.price,
          billing_cycle: subscriptionData.billingCycle,
          next_payment_date: subscriptionData.nextBillingDate,
          category: subscriptionData.category || 'other',
          is_manual: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating subscription:', error);
        return res.status(500).json({ 
          error: 'database_error', 
          message: 'Failed to create subscription',
          details: process.env.NODE_ENV === 'production' ? undefined : error.message
        });
      }
      
      return res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        subscription: data
      });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
} 