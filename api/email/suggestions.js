// Email subscription suggestions endpoint
import jsonwebtoken from 'jsonwebtoken';
const { verify } = jsonwebtoken;

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for email/suggestions');
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
    
    // Verify the token
    try {
      const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
      const decoded = verify(token, jwtSecret);
      
      // Get scan ID from query parameters (optional)
      const scanId = req.query.scanId;
      
      // In a real implementation, we would check a database for the most recent scan
      // and the suggestions generated from it
      // For this demo, we'll use the global cache if available
      if (scanId && global.scanStatus && global.scanStatus[scanId]) {
        const scanStatus = global.scanStatus[scanId];
        
        // Verify the scan belongs to this user
        if (scanStatus.userId !== decoded.id) {
          return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this scan' });
        }
        
        // Return suggestions if the scan is completed
        if (scanStatus.status === 'completed' && scanStatus.results && scanStatus.results.subscriptionsFound) {
          return res.status(200).json({
            success: true,
            suggestions: scanStatus.results.subscriptionsFound.map(sub => ({
              id: sub.id,
              service_name: sub.service_name,
              price: sub.price,
              currency: sub.currency,
              billing_frequency: sub.billing_cycle,
              confidence: sub.confidence,
              email_subject: sub.email_subject,
              email_from: sub.email_from,
              email_date: sub.email_date,
              next_billing_date: sub.next_billing_date
            }))
          });
        } else if (scanStatus.status === 'in_progress') {
          return res.status(202).json({
            success: false,
            message: 'Scan is still in progress',
            progress: scanStatus.progress || 0
          });
        } else if (scanStatus.status === 'error') {
          return res.status(500).json({
            success: false,
            error: scanStatus.error || 'Unknown error',
            message: 'Scan encountered an error'
          });
        }
      }
      
      // If we get here, either:
      // 1. No scanId was provided
      // 2. The scanId doesn't exist in our cache
      // 3. The scan status doesn't have the expected data
      
      // Return mock suggestions for demonstration purposes
      // In a real implementation, you would query your database
      return res.status(200).json({
        success: true,
        suggestions: [
          {
            id: 'sugg_1',
            service_name: 'Netflix',
            price: 15.99,
            currency: 'USD',
            billing_frequency: 'monthly',
            confidence: 0.95,
            email_subject: 'Your Netflix Subscription',
            email_from: 'info@netflix.com',
            email_date: new Date().toISOString(),
            next_billing_date: null
          },
          {
            id: 'sugg_2',
            service_name: 'Spotify',
            price: 9.99,
            currency: 'USD',
            billing_frequency: 'monthly',
            confidence: 0.92,
            email_subject: 'Your Spotify Premium Receipt',
            email_from: 'no-reply@spotify.com',
            email_date: new Date().toISOString(),
            next_billing_date: null
          },
          {
            id: 'sugg_3',
            service_name: 'Amazon Prime',
            price: 119,
            currency: 'USD',
            billing_frequency: 'yearly',
            confidence: 0.89,
            email_subject: 'Your Amazon Prime Membership Receipt',
            email_from: 'auto-confirm@amazon.com',
            email_date: new Date().toISOString(),
            next_billing_date: null
          }
        ]
      });
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Email suggestions error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request'
    });
  }
} 