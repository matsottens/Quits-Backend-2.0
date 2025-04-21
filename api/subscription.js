// Subscription API endpoint
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
        
        // Return mock subscription data for now
        // In a real implementation, you would fetch this from a database
        return res.status(200).json({
          success: true,
          subscriptions: [
            {
              id: 'sub_123',
              name: 'Netflix',
              price: 15.99,
              billingCycle: 'monthly',
              nextBillingDate: '2023-05-15',
              category: 'entertainment'
            },
            {
              id: 'sub_124',
              name: 'Spotify',
              price: 9.99,
              billingCycle: 'monthly',
              nextBillingDate: '2023-05-10',
              category: 'music'
            },
            {
              id: 'sub_125',
              name: 'Amazon Prime',
              price: 119,
              billingCycle: 'yearly',
              nextBillingDate: '2023-12-01',
              category: 'shopping'
            }
          ],
          meta: {
            total: 3,
            totalMonthly: 25.98,
            totalYearly: 119,
            totalAnnualized: 431.76
          }
        });
      } catch (tokenError) {
        console.error('Token verification error:', tokenError);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } else if (req.method === 'POST') {
      // Code for creating a subscription
      return res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        subscription: {
          id: 'sub_' + Math.random().toString(36).substring(2, 10),
          createdAt: new Date().toISOString()
        }
      });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An error occurred processing your request'
    });
  }
} 