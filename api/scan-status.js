// Scan status endpoint
import jsonwebtoken from 'jsonwebtoken';
const { verify } = jsonwebtoken;

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
      
      // Check if the scan exists in our global cache
      if (global.scanStatus && global.scanStatus[scanId]) {
        const scanStatus = global.scanStatus[scanId];
        
        // Verify the scan belongs to this user
        if (scanStatus.userId !== decoded.id) {
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
      
      // If we get here, the scan either doesn't exist or we don't have its status
      // For demo purposes, we'll generate a mock response based on the scan ID
      // In a real implementation, you would query a database
      
      // Use the scanId to simulate different states for demo purposes
      const idSum = scanId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      
      if (idSum % 3 === 0) {
        // Pending status
        return res.status(200).json({
          success: true,
          status: 'pending',
          scanId: scanId,
          progress: 0,
          message: 'Scan is queued and will start soon'
        });
      } else if (idSum % 3 === 1) {
        // In progress
        const progress = Math.floor(Math.random() * 90) + 10; // Random progress between 10-99%
        return res.status(200).json({
          success: true,
          status: 'in_progress',
          scanId: scanId,
          progress: progress,
          message: 'Scan in progress'
        });
      } else {
        // Completed with mock data
        return res.status(200).json({
          success: true,
          status: 'completed',
          scanId: scanId,
          progress: 100,
          results: {
            totalEmailsScanned: 1243,
            subscriptionsFound: [
              {
                id: 'rec_123',
                service_name: 'Netflix',
                email_from: 'info@netflix.com',
                email_subject: 'Your Netflix Subscription',
                email_date: new Date().toISOString(),
                price: 15.99,
                currency: 'USD',
                billing_cycle: 'monthly',
                confidence: 0.95
              },
              {
                id: 'rec_124',
                service_name: 'Spotify',
                email_from: 'no-reply@spotify.com',
                email_subject: 'Your Spotify Premium Receipt',
                email_date: new Date().toISOString(),
                price: 9.99,
                currency: 'USD',
                billing_cycle: 'monthly',
                confidence: 0.92
              },
              {
                id: 'rec_125',
                service_name: 'Amazon Prime',
                email_from: 'auto-confirm@amazon.com',
                email_subject: 'Your Amazon Prime Membership Receipt',
                email_date: new Date().toISOString(),
                price: 119,
                currency: 'USD',
                billing_cycle: 'yearly',
                confidence: 0.89
              }
            ]
          }
        });
      }
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Scan status error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request'
    });
  }
} 