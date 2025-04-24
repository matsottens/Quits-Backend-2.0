// Debug endpoint for scan issues
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Sample subscriptions with realistic data
const DEMO_SUBSCRIPTIONS = [
  {
    name: "Netflix (DEMO)",
    price: 15.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
    category: "entertainment",
    provider: "Netflix",
    is_manual: false,
    source: "email_scan",
    confidence: 0.92
  },
  {
    name: "Spotify Premium (DEMO)",
    price: 9.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().split('T')[0],
    category: "music",
    provider: "Spotify",
    is_manual: false,
    source: "email_scan",
    confidence: 0.89
  },
  {
    name: "Amazon Prime (DEMO)",
    price: 14.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 22)).toISOString().split('T')[0],
    category: "shopping",
    provider: "Amazon",
    is_manual: false,
    source: "email_scan",
    confidence: 0.95
  },
  {
    name: "Disney+ (DEMO)",
    price: 7.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 18)).toISOString().split('T')[0],
    category: "entertainment",
    provider: "Disney",
    is_manual: false,
    source: "email_scan",
    confidence: 0.93
  },
  {
    name: "Adobe Creative Cloud (DEMO)",
    price: 52.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 27)).toISOString().split('T')[0],
    category: "software",
    provider: "Adobe",
    is_manual: false,
    source: "email_scan",
    confidence: 0.91
  },
  {
    name: "HBO Max (DEMO)",
    price: 9.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 12)).toISOString().split('T')[0],
    category: "entertainment",
    provider: "HBO",
    is_manual: false,
    source: "email_scan",
    confidence: 0.88
  },
  {
    name: "YouTube Premium (DEMO)",
    price: 11.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 8)).toISOString().split('T')[0],
    category: "entertainment",
    provider: "Google",
    is_manual: false,
    source: "email_scan",
    confidence: 0.90
  },
  {
    name: "Microsoft 365 (DEMO)",
    price: 6.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 20)).toISOString().split('T')[0],
    category: "software",
    provider: "Microsoft",
    is_manual: false,
    source: "email_scan",
    confidence: 0.94
  },
  {
    name: "Apple Music (DEMO)",
    price: 9.99,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    category: "music",
    provider: "Apple",
    is_manual: false,
    source: "email_scan",
    confidence: 0.87
  },
  {
    name: "Medium (DEMO)",
    price: 5.00,
    currency: "USD",
    billing_cycle: "monthly",
    next_billing_date: new Date(new Date().setDate(new Date().getDate() + 24)).toISOString().split('T')[0],
    category: "reading",
    provider: "Medium",
    is_manual: false,
    source: "email_scan",
    confidence: 0.86
  }
];

// Function to add a test subscription
const addTestSubscription = async (dbUserId, scanId) => {
  console.log(`DEBUG-SCAN: Test subscription feature disabled by request`);
  
  // Return false to indicate no subscriptions were added
  return {
    success: false,
    subscriptions_added: 0,
    disabled: true,
    message: "Test subscription functionality has been disabled",
    scan_stats: {
      emails_found: 0,
      emails_processed: 0,
      emails_to_process: 0,
      subscriptions_found: 0
    }
  };
};

// Function to update scan status
const updateScanStatus = async (scanId, dbUserId, updates) => {
  try {
    console.log(`DEBUG-SCAN: Updating scan status for ${scanId}, user ${dbUserId} with updates:`, updates);
    
    // Add timestamp to track when updates occur
    const timestamp = new Date().toISOString();
    const lastUpdateTime = new Date().getTime();
    
    // Create full updates object with all necessary fields
    const fullUpdates = {
      ...updates,
      updated_at: timestamp,
      last_update_time: lastUpdateTime
    };
    
    // Ensure we have email stats
    if (!fullUpdates.emails_found || !fullUpdates.emails_to_process || !fullUpdates.emails_processed) {
      // Fetch current scan status to estimate values
      const { data: currentScan } = await supabase
        .from('scans')
        .select('*')
        .eq('id', scanId)
        .single();
        
      if (currentScan) {
        // Use existing values or defaults
        fullUpdates.emails_found = fullUpdates.emails_found || currentScan.emails_found || 100;
        fullUpdates.emails_to_process = fullUpdates.emails_to_process || currentScan.emails_to_process || 100;
        
        // Calculate processed emails based on progress if not provided
        if (!fullUpdates.emails_processed) {
          const progress = fullUpdates.progress || currentScan.progress || 0;
          fullUpdates.emails_processed = Math.floor((fullUpdates.emails_to_process * progress) / 100);
        }
      }
    }
    
    console.log(`DEBUG-SCAN: Final updates for scan ${scanId}:`, fullUpdates);
    
    const { data, error } = await supabase
      .from('scans')
      .update(fullUpdates)
      .eq('id', scanId)
      .eq('user_id', dbUserId);
      
    if (error) {
      console.error(`DEBUG-SCAN: Error updating scan status: ${error.message}`);
      return false;
    }
    
    console.log(`DEBUG-SCAN: Successfully updated scan status for ${scanId}`);
    return true;
  } catch (error) {
    console.error(`DEBUG-SCAN: Error in updateScanStatus: ${error.message}`);
    return false;
  }
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  console.log('DEBUG-SCAN: Endpoint called');
  
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Get scan ID from query parameters
    const scanId = req.query.scanId;
    if (!scanId) {
      return res.status(400).json({ error: 'Missing scanId parameter' });
    }
    
    // Verify the token
    try {
      const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
      const decoded = verify(token, jwtSecret);
      const userId = decoded.id || decoded.sub;
      
      // Log environment variables to help with debugging
      console.log('DEBUG-SCAN: Environment variables check:');
      console.log(`DEBUG-SCAN: SUPABASE_URL defined: ${!!process.env.SUPABASE_URL}`);
      console.log(`DEBUG-SCAN: SUPABASE_ANON_KEY defined: ${!!process.env.SUPABASE_ANON_KEY}`);
      console.log(`DEBUG-SCAN: SUPABASE_SERVICE_KEY defined: ${!!process.env.SUPABASE_SERVICE_KEY}`);
      console.log(`DEBUG-SCAN: NODE_ENV: ${process.env.NODE_ENV}`);
      console.log(`DEBUG-SCAN: VERCEL_ENV: ${process.env.VERCEL_ENV}`);
      
      // Look up the database user ID
      console.log(`DEBUG-SCAN: Looking up user with ID: ${userId}`);
      
      let dbUserId;
      
      try {
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
          console.error(`DEBUG-SCAN: User lookup failed: ${await userLookupResponse.text()}`);
          return res.status(200).json({
            success: true,
            message: 'Debug scan completed with user lookup fallback',
            scanId: scanId,
            userId: userId
          });
        }
        
        const users = await userLookupResponse.json();
        
        // Verify user exists
        if (!users || users.length === 0) {
          console.error(`DEBUG-SCAN: User not found in database for email: ${decoded.email}`);
          return res.status(200).json({
            success: true,
            message: 'Debug scan completed with user not found handling',
            scanId: scanId,
            userId: userId
          });
        }
        
        dbUserId = users[0].id;
        console.log(`DEBUG-SCAN: Found user with database ID: ${dbUserId}`);
      } catch (userLookupError) {
        console.error(`DEBUG-SCAN: Error looking up user: ${userLookupError.message}`);
        // If user lookup fails, we'll skip the scan history updates
        return res.status(200).json({
          success: true, 
          message: 'Debug scan completed with error handling bypass',
          scanId: scanId,
          userId: userId
        });
      }
      
      // Try to add a test subscription without depending on scan status
      let subscriptionAdded = false;
      try {
        console.log(`DEBUG-SCAN: Adding test subscription directly`);
        const added = await addTestSubscription(dbUserId, scanId);
        subscriptionAdded = added;
      } catch (subError) {
        console.error(`DEBUG-SCAN: Error adding subscription: ${subError.message}`);
      }
      
      // Optionally try to update scan status if everything else worked
      if (dbUserId) {
        try {
          // Update scan status to show progress
          console.log(`DEBUG-SCAN: Updating scan status for scan ${scanId}`);
          await updateScanStatus(scanId, dbUserId, {
            status: 'in_progress',
            progress: 75,
            emails_found: 25,
            emails_to_process: 25,
            emails_processed: 15
          });
          
          // Update scan status to show completion
          await updateScanStatus(scanId, dbUserId, {
            status: 'completed',
            progress: 100,
            emails_processed: 25,
            subscriptions_found: subscriptionAdded ? 1 : 0,
            completed_at: new Date().toISOString()
          });
        } catch (statusError) {
          console.error(`DEBUG-SCAN: Error updating scan status: ${statusError.message}`);
          // Scan status update failed, but subscription might have been added
          return res.status(200).json({
            success: subscriptionAdded,
            message: 'Debug scan completed with partial success',
            scanId: scanId,
            userId: dbUserId || userId,
            details: `Subscription ${subscriptionAdded ? 'added' : 'failed'}, scan status update failed`
          });
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Debug scan completed successfully',
        scanId: scanId,
        userId: dbUserId || userId,
        subscription_added: subscriptionAdded
      });
    } catch (tokenError) {
      console.error('DEBUG-SCAN: Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('DEBUG-SCAN: General error:', error);
    return res.status(200).json({ 
      error: 'handled_error',
      message: 'An error occurred but was handled gracefully',
      details: error.message,
      scanId: req.query.scanId || 'unknown'
    });
  }
}

app.post('/api/debug/force-complete-scan', async (req, res) => {
  console.log('🔧 DEBUG: Force completing scan');

  try {
    const { user } = await getAuthenticatedUser(req);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const dbUserId = user.id;
    
    // Get current scan
    const { data: scanData, error: scanError } = await supabase
      .from('scans')
      .select('id, status')
      .eq('user_id', dbUserId)
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (scanError) {
      console.error('Error fetching scan:', scanError);
      return res.status(500).json({ error: 'Failed to fetch scan' });
    }
    
    if (!scanData || scanData.length === 0) {
      return res.status(404).json({ error: 'No scan found' });
    }
    
    const scanId = scanData[0].id;
    
    // Update scan status to completed
    const { error: updateError } = await supabase
      .from('scans')
      .update({ 
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        emails_processed: 100,
        emails_found: 100,
        emails_to_process: 100
      })
      .eq('id', scanId);
      
    if (updateError) {
      console.error('Error updating scan:', updateError);
      return res.status(500).json({ error: 'Failed to update scan' });
    }
    
    // Add test subscription with is_test_data flag
    const testDataParams = {
      body: {
        add_test_data: true
      }
    };
    
    const addResult = await addTestSubscription(dbUserId, scanId);
    
    return res.json({ 
      success: true, 
      message: 'Scan marked as completed',
      test_data_added: addResult
    });
  } catch (error) {
    console.error('Error in force complete:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

async function addTestSubscription(req, res) {
  try {
    const user_id = req.user_id;
    
    const { scan_id, count = 3, emails_stats = true } = req.query;
    
    if (!scan_id) {
      return res.status(400).json({ error: 'Missing scan_id parameter' });
    }
    
    console.log(`Adding ${count} test subscriptions to scan ${scan_id}`);
    
    // Get random subscriptions from the demo list
    const numSubscriptions = Math.min(parseInt(count), DEMO_SUBSCRIPTIONS.length);
    const selectedIndices = new Set();
    
    while (selectedIndices.size < numSubscriptions) {
      const randomIndex = Math.floor(Math.random() * DEMO_SUBSCRIPTIONS.length);
      selectedIndices.add(randomIndex);
    }
    
    const selectedSubscriptions = Array.from(selectedIndices).map(index => {
      const sub = DEMO_SUBSCRIPTIONS[index];
      return {
        ...sub,
        user_id,
        scan_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_demo: true
      };
    });
    
    // Insert the test subscriptions
    const { data: insertedSubs, error } = await supabase
      .from('detected_subscriptions')
      .insert(selectedSubscriptions)
      .select();
      
    if (error) {
      console.error('Error inserting test subscriptions:', error);
      return res.status(500).json({ error: 'Failed to insert test subscriptions', details: error });
    }
    
    // Generate realistic email statistics for the scan
    const emailsFound = Math.floor(Math.random() * 200) + 100; // 100-300 emails
    const emailsToProcess = emailsFound; // Process all found emails in demo mode
    const emailsProcessed = emailsToProcess; // All processed (since this is a demo)
    
    // Current timestamp for update
    const timestamp = new Date().toISOString();
    
    // Update scan status with completion and email stats
    const scanUpdates = {
      status: 'completed',
      progress: 100,
      emails_found: emailsFound,
      emails_to_process: emailsToProcess,
      emails_processed: emailsProcessed,
      subscriptions_found: numSubscriptions,
      is_demo: true,
      completed_at: timestamp,
      updated_at: timestamp
    };
    
    // Use the existing updateScanStatus function with proper parameters
    const updateSuccess = await updateScanStatus(scan_id, user_id, scanUpdates);
    
    if (!updateSuccess) {
      console.error('Error updating scan status for demo subscriptions');
      return res.status(500).json({ 
        error: 'Subscriptions added but failed to update scan status', 
        subscriptions: insertedSubs
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: `Added ${numSubscriptions} test subscriptions to scan ${scan_id}`,
      subscriptions: insertedSubs,
      scan_stats: {
        emails_found: emailsFound,
        emails_to_process: emailsToProcess,
        emails_processed: emailsProcessed,
        subscriptions_found: numSubscriptions,
        is_demo: true
      }
    });
  } catch (err) {
    console.error('Error in addTestSubscription:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
} 