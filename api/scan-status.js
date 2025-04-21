// Scan status endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Helper function to extract Gmail token from JWT
const extractGmailToken = (token) => {
  try {
    const payload = jsonwebtoken.decode(token);
    return payload.gmail_token || null;
  } catch (error) {
    console.error('Error extracting Gmail token:', error);
    return null;
  }
};

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for scan-status');
    return res.status(204).end();
  }
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    // Check for GET method
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

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
      
      // For newer scans, check the database
      if (supabaseUrl && supabaseKey) {
        try {
          // First, look up the database user ID
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
            console.log(`User not found in database for email: ${decoded.email}`);
            // Fall back to mock data (consider this scan as pending)
            return res.status(200).json({
              success: true,
              status: 'pending',
              scanId: scanId,
              progress: 0,
              message: 'Scan is being initialized'
            });
          }
          
          const dbUserId = users[0].id;
          
          // Look up scan in the database
          const scanLookupResponse = await fetch(
            `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}&user_id=eq.${dbUserId}&select=*`, 
            {
              method: 'GET',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (!scanLookupResponse.ok) {
            throw new Error(`Scan lookup failed: ${await scanLookupResponse.text()}`);
          }
          
          const scanData = await scanLookupResponse.json();
          
          // If scan found in database, return its status
          if (scanData && scanData.length > 0) {
            const scan = scanData[0];
            
            if (scan.status === 'completed') {
              // Fetch detected subscriptions
              const subsResponse = await fetch(
                `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${dbUserId}&source=eq.email_scan&select=*&order=created_at.desc`, 
                {
                  method: 'GET',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              if (!subsResponse.ok) {
                throw new Error(`Subscription lookup failed: ${await subsResponse.text()}`);
              }
              
              const subscriptions = await subsResponse.json();
              
              // Return completion status with detected subscriptions
              return res.status(200).json({
                success: true,
                status: 'completed',
                scanId: scanId,
                progress: 100,
                completedAt: scan.completed_at,
                results: {
                  totalEmailsScanned: scan.emails_scanned || 0,
                  subscriptionsFound: subscriptions.map(sub => ({
                    id: sub.id,
                    service_name: sub.name,
                    price: parseFloat(sub.price || 0),
                    currency: 'USD',
                    billing_cycle: sub.billing_cycle,
                    next_billing_date: sub.next_billing_date,
                    confidence: sub.confidence || 0.8
                  }))
                }
              });
            } else if (scan.status === 'error') {
              return res.status(200).json({
                success: false,
                status: 'error',
                scanId: scanId,
                error: scan.error_message || 'Unknown error',
                message: 'Scan encountered an error'
              });
            } else {
              // In progress or pending
              return res.status(200).json({
                success: true,
                status: scan.status || 'in_progress',
                scanId: scanId,
                progress: scan.progress || 50,
                message: 'Scan in progress'
              });
            }
          }
        } catch (dbError) {
          console.error('Database error checking scan status:', dbError);
          // Continue to fallback logic below
        }
      }
      
      // Check if the scan exists in our global cache (legacy support)
      if (global.scanStatus && global.scanStatus[scanId]) {
        const scanStatus = global.scanStatus[scanId];
        
        // Verify the scan belongs to this user
        if (scanStatus.userId && scanStatus.userId !== userId) {
          return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this scan' });
        }
        
        // Return the appropriate response based on scan status
        if (scanStatus.status === 'in_progress') {
          return res.status(200).json({
            success: true,
            status: 'in_progress',
            scanId: scanId,
            progress: scanStatus.progress || 0,
            message: 'Scan in progress'
          });
        } else if (scanStatus.status === 'completed') {
          return res.status(200).json({
            success: true,
            status: 'completed',
            scanId: scanId,
            progress: 100,
            results: scanStatus.results || { totalEmailsScanned: 0, subscriptionsFound: [] }
          });
        } else if (scanStatus.status === 'error') {
          return res.status(200).json({
            success: false,
            status: 'error',
            scanId: scanId,
            error: scanStatus.error || 'Unknown error',
            message: 'Scan encountered an error'
          });
        }
      }
      
      // If we get here, assume the scan is in progress and create an entry in the database
      // This handles the case where we got a scan ID but don't have the status yet
      try {
        console.log(`Creating pending scan record for scanId ${scanId}`);
        // First, look up the database user ID again if we don't have it
        let dbUserId = null;
        if (!dbUserId) {
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
          
          if (userLookupResponse.ok) {
            const users = await userLookupResponse.json();
            if (users && users.length > 0) {
              dbUserId = users[0].id;
            }
          }
        }
        
        if (dbUserId) {
          // Create a scan record
          await fetch(
            `${supabaseUrl}/rest/v1/scan_history`, 
            {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({
                scan_id: scanId,
                user_id: dbUserId,
                status: 'in_progress',
                progress: 30,
                created_at: new Date().toISOString()
              })
            }
          );
        }
      } catch (createError) {
        console.error('Error creating scan record:', createError);
      }
      
      // Return an in-progress status
      return res.status(200).json({
        success: true,
        status: 'in_progress',
        scanId: scanId,
        progress: 30,
        message: 'Scan in progress'
      });
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Scan status error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 