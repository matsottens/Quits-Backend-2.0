// Debug endpoint for scan issues
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Function to add a test subscription
const addTestSubscription = async (dbUserId) => {
  try {
    console.log(`DEBUG-SCAN: Adding test subscription for user ${dbUserId}`);
    
    // Create a subscription in the database
    const response = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions`, 
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          user_id: dbUserId,
          name: "Debug Subscription (Manually Created)",
          price: 9.99,
          currency: "USD",
          billing_cycle: "monthly",
          next_billing_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
          confidence: 0.95,
          source: "debug_endpoint",
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to create subscription: ${await response.text()}`);
    }
    
    const subscription = await response.json();
    console.log(`DEBUG-SCAN: Successfully added test subscription with ID: ${subscription[0]?.id}`);
    return true;
  } catch (error) {
    console.error(`DEBUG-SCAN: Error adding test subscription: ${error.message}`);
    return false;
  }
};

// Function to update scan status
const updateScanStatus = async (scanId, dbUserId, updates) => {
  try {
    console.log(`DEBUG-SCAN: Updating status for scan ${scanId}: ${JSON.stringify(updates)}`);
    
    // Update the scan record in the database
    const response = await fetch(
      `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, 
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...updates,
          updated_at: new Date().toISOString()
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to update scan status: ${await response.text()}`);
    }
    
    console.log(`DEBUG-SCAN: Successfully updated scan status`);
    return true;
  } catch (error) {
    console.error(`DEBUG-SCAN: Error updating scan status: ${error.message}`);
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
      
      // Look up the database user ID
      console.log(`DEBUG-SCAN: Looking up user with ID: ${userId}`);
      
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
        throw new Error(`User lookup failed: ${await userLookupResponse.text()}`);
      }
      
      const users = await userLookupResponse.json();
      
      // Verify user exists
      if (!users || users.length === 0) {
        throw new Error(`User not found in database for email: ${decoded.email}`);
      }
      
      const dbUserId = users[0].id;
      console.log(`DEBUG-SCAN: Found user with database ID: ${dbUserId}`);
      
      // Update scan status to show progress
      console.log(`DEBUG-SCAN: Updating scan status for scan ${scanId}`);
      await updateScanStatus(scanId, dbUserId, {
        status: 'in_progress',
        progress: 50,
        emails_found: 25,
        emails_to_process: 25,
        emails_processed: 15
      });
      
      // Add a test subscription
      console.log(`DEBUG-SCAN: Adding test subscription`);
      const added = await addTestSubscription(dbUserId);
      
      if (added) {
        // Update scan status to show completion
        await updateScanStatus(scanId, dbUserId, {
          status: 'completed',
          progress: 100,
          emails_processed: 25,
          subscriptions_found: 1,
          completed_at: new Date().toISOString()
        });
        
        return res.status(200).json({
          success: true,
          message: 'Debug scan completed and test subscription added',
          scanId: scanId,
          userId: dbUserId
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Failed to add test subscription',
          scanId: scanId,
          userId: dbUserId
        });
      }
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Debug scan error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 