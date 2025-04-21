// Scan status endpoint
import { verify } from 'jsonwebtoken';

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
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET environment variable is not set');
      }
      
      const decoded = verify(token, jwtSecret);
      
      // Simulate scan status based on random status
      // In a real implementation, you would fetch the actual status from a database
      const statuses = ['pending', 'in_progress', 'completed'];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      
      // If status is completed, return mock data
      if (randomStatus === 'completed') {
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
                name: 'Netflix',
                email: 'info@netflix.com',
                price: 15.99,
                currency: 'USD',
                billingCycle: 'monthly',
                confidence: 0.95
              },
              {
                id: 'rec_124',
                name: 'Spotify',
                email: 'no-reply@spotify.com',
                price: 9.99,
                currency: 'USD',
                billingCycle: 'monthly',
                confidence: 0.92
              },
              {
                id: 'rec_125',
                name: 'Amazon Prime',
                email: 'auto-confirm@amazon.com',
                price: 119,
                currency: 'USD',
                billingCycle: 'yearly',
                confidence: 0.89
              }
            ],
            meta: {
              scanDuration: '45 seconds',
              emailsWithSubscriptions: 37
            }
          }
        });
      } else if (randomStatus === 'in_progress') {
        // Return progress status
        return res.status(200).json({
          success: true,
          status: 'in_progress',
          scanId: scanId,
          progress: Math.floor(Math.random() * 90) + 10, // Random progress between 10-99%
          message: 'Scan in progress'
        });
      } else {
        // Return pending status
        return res.status(200).json({
          success: true,
          status: 'pending',
          scanId: scanId,
          progress: 0,
          message: 'Scan is queued and will start soon'
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