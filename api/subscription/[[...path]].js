// Catch-all handler for subscription endpoints
import jsonwebtoken from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
const { verify } = jsonwebtoken;

// Initialize Supabase client with debugging
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
console.log(`[PATH HANDLER] Supabase URL defined: ${!!supabaseUrl}`);
console.log(`[PATH HANDLER] Supabase key defined: ${!!supabaseKey}`);
console.log(`[PATH HANDLER] Supabase URL prefix: ${supabaseUrl?.substring(0, 10) || 'undefined'}...`);
console.log(`[PATH HANDLER] Supabase key prefix: ${supabaseKey?.substring(0, 5) || 'undefined'}...`);

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[PATH HANDLER] Supabase client created successfully');
} catch (clientError) {
  console.error('[PATH HANDLER] Error creating Supabase client:', clientError);
}

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
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
  
  // Log environment details
  console.log('[PATH HANDLER] Environment variables check:');
  console.log(`[PATH HANDLER] SUPABASE_URL defined: ${!!process.env.SUPABASE_URL}`);
  console.log(`[PATH HANDLER] SUPABASE_ANON_KEY defined: ${!!process.env.SUPABASE_ANON_KEY}`);
  console.log(`[PATH HANDLER] SUPABASE_SERVICE_KEY defined: ${!!process.env.SUPABASE_SERVICE_KEY}`);
  console.log(`[PATH HANDLER] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[PATH HANDLER] VERCEL_ENV: ${process.env.VERCEL_ENV}`);

  try {
    // Parse the path to determine which operation to perform
    const path = req.query.path || [];
    const isSpecificSubscription = path.length > 0;
    const subscriptionId = isSpecificSubscription ? path[0] : null;
    
    // Check if Supabase client was initialized successfully
    if (!supabase) {
      console.error('[PATH HANDLER] Supabase client not initialized');
      return res.status(500).json({
        error: 'supabase_not_initialized',
        message: 'Database client could not be initialized',
        details: {
          supabase_url_defined: !!supabaseUrl,
          supabase_key_defined: !!supabaseKey
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
      const userId = decoded.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'Invalid user ID in token' });
      }
      
      // For now, return mock data to prevent errors while debugging
      console.log('[PATH HANDLER] Returning mock data for path handler while debugging Supabase connection');
      return res.status(200).json({
        success: true,
        subscriptions: [
          {
            id: 'mock_sub_123',
            name: 'Netflix (Mock from Path Handler)',
            price: 15.99,
            billingCycle: 'monthly',
            nextBillingDate: '2023-05-15',
            category: 'entertainment',
            is_manual: true
          },
          {
            id: 'mock_sub_124',
            name: 'Spotify (Mock from Path Handler)',
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
          mock_data: true,
          path_handler: true,
          debug_info: {
            supabase_url_defined: !!process.env.SUPABASE_URL,
            supabase_key_defined: !!process.env.SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_KEY,
            path: path,
            request_url: req.url
          }
        }
      });
      
      // The rest of the code will not execute during debugging, but leaving it for when we fix the Supabase connection
      // Handle different HTTP methods
      if (req.method === 'GET') {
        // For specific subscription
        if (isSpecificSubscription) {
          console.log(`Fetching subscription ${subscriptionId} for user ${userId}`);
          
          const { data: subscription, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('id', subscriptionId)
            .eq('user_id', userId)
            .single();
            
          if (error) {
            if (error.code === 'PGRST116') { // Record not found
              return res.status(404).json({ 
                error: 'not_found', 
                message: 'Subscription not found' 
              });
            }
            
            console.error('Database error:', error);
            return res.status(500).json({ 
              error: 'database_error', 
              message: 'Error fetching subscription',
              details: process.env.NODE_ENV === 'production' ? undefined : error.message
            });
          }
          
          // Map database fields to frontend expected format
          const formattedSubscription = {
            id: subscription.id,
            name: subscription.name,
            price: subscription.price,
            billingCycle: subscription.billing_cycle,
            nextBillingDate: subscription.next_payment_date,
            category: subscription.category || 'other',
            is_manual: subscription.is_manual || false,
            createdAt: subscription.created_at,
            updatedAt: subscription.updated_at
          };
          
          return res.status(200).json({
            success: true,
            subscription: formattedSubscription
          });
        } 
        // For all subscriptions
        else {
          console.log(`Fetching all subscriptions for user ${userId}`);
          
          const { data: subscriptions, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId);
            
          if (error) {
            console.error('Database error:', error);
            return res.status(500).json({ 
              error: 'database_error', 
              message: 'Error fetching subscriptions',
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
          
          // Map database field names to frontend expected format
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
        }
      } 
      else if (req.method === 'POST') {
        // Create new subscription
        const subscriptionData = req.body;
        
        // Validate required fields
        if (!subscriptionData.name || !subscriptionData.price || !subscriptionData.billingCycle) {
          return res.status(400).json({ 
            error: 'invalid_input', 
            message: 'Missing required fields (name, price, billingCycle)'
          });
        }
        
        // Insert into database
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
      }
      else if (req.method === 'PUT' || req.method === 'PATCH') {
        // Check if we have a subscription ID
        if (!isSpecificSubscription) {
          return res.status(400).json({ 
            error: 'missing_id', 
            message: 'Subscription ID is required for updates' 
          });
        }
        
        const subscriptionData = req.body;
        
        // Prepare update data object with snake_case for database
        const updateData = {
          updated_at: new Date().toISOString()
        };
        
        // Map camelCase frontend fields to snake_case database fields
        if (subscriptionData.name) updateData.name = subscriptionData.name;
        if (subscriptionData.price !== undefined) updateData.price = subscriptionData.price;
        if (subscriptionData.billingCycle) updateData.billing_cycle = subscriptionData.billingCycle;
        if (subscriptionData.nextBillingDate) updateData.next_payment_date = subscriptionData.nextBillingDate;
        if (subscriptionData.category) updateData.category = subscriptionData.category;
        
        // Update the subscription
        const { data, error } = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('id', subscriptionId)
          .eq('user_id', userId)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating subscription:', error);
          return res.status(500).json({ 
            error: 'database_error', 
            message: 'Failed to update subscription',
            details: process.env.NODE_ENV === 'production' ? undefined : error.message
          });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Subscription updated successfully',
          subscription: data
        });
      }
      else if (req.method === 'DELETE') {
        // Check if we have a subscription ID
        if (!isSpecificSubscription) {
          return res.status(400).json({ 
            error: 'missing_id', 
            message: 'Subscription ID is required for deletion' 
          });
        }
        
        // Delete the subscription
        const { error } = await supabase
          .from('subscriptions')
          .delete()
          .eq('id', subscriptionId)
          .eq('user_id', userId);
        
        if (error) {
          console.error('Error deleting subscription:', error);
          return res.status(500).json({ 
            error: 'database_error', 
            message: 'Failed to delete subscription',
            details: process.env.NODE_ENV === 'production' ? undefined : error.message
          });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Subscription deleted successfully'
        });
      }
      else {
        return res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Subscription handler error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack,
      debug_info: {
        supabase_url_defined: !!process.env.SUPABASE_URL,
        supabase_key_defined: !!process.env.SUPABASE_ANON_KEY || !!process.env.SUPABASE_SERVICE_KEY,
        error_message: error.message
      }
    });
  }
} 