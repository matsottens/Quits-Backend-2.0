// Email subscription confirmation endpoint
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
    console.log('Handling OPTIONS preflight request for email/suggestions/[id]/confirm');
    return res.status(204).end();
  }
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    // Check for POST method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Get suggestion ID from URL path
    const suggestionId = req.query.id;
    if (!suggestionId) {
      return res.status(400).json({ error: 'Missing suggestion ID' });
    }
    
    // Extract confirmation status from request body
    const { confirmed = true } = req.body || {};
    
    // Verify the token
    try {
      const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
      const decoded = verify(token, jwtSecret);
      
      // In a real implementation, we would:
      // 1. Look up the suggestion in a database
      // 2. Verify the suggestion belongs to this user
      // 3. If confirmed, create a new subscription
      // 4. If rejected, mark the suggestion as rejected
      // 5. Return the appropriate response
      
      // For this demo, we'll simulate a successful operation
      // In a production system, you'd check your database for the suggestion

      // If we can find the suggestion in our global cache, use that
      let foundSuggestion = null;
      
      // Loop through all scans to find the suggestion
      if (global.scanStatus) {
        for (const scanId in global.scanStatus) {
          const scan = global.scanStatus[scanId];
          if (scan.status === 'completed' && 
              scan.results && 
              scan.results.subscriptionsFound &&
              scan.userId === decoded.id) {
            
            // Look for the suggestion in this scan
            const suggestion = scan.results.subscriptionsFound.find(s => s.id === suggestionId);
            if (suggestion) {
              foundSuggestion = suggestion;
              break;
            }
          }
        }
      }
      
      // If we found the suggestion, handle confirmation
      if (foundSuggestion) {
        // If confirmed, we would save this as a subscription
        if (confirmed) {
          // In a real implementation, we would save to a database
          // For this demo, we'll just return a success response
          return res.status(200).json({
            success: true,
            message: 'Subscription suggestion confirmed',
            subscription: {
              id: 'sub_' + Math.random().toString(36).substring(2, 10),
              name: foundSuggestion.service_name,
              price: foundSuggestion.price,
              currency: foundSuggestion.currency,
              billing_cycle: foundSuggestion.billing_cycle,
              provider: foundSuggestion.service_name,
              category: 'Other',
              is_manual: false,
              created_at: new Date().toISOString(),
              next_billing_date: foundSuggestion.next_billing_date
            }
          });
        } else {
          // If rejected, we would mark as rejected in a database
          return res.status(200).json({
            success: true,
            message: 'Subscription suggestion rejected'
          });
        }
      }
      
      // If we didn't find the suggestion, return a mock response for demo purposes
      return res.status(200).json({
        success: true,
        message: confirmed 
          ? 'Subscription suggestion confirmed' 
          : 'Subscription suggestion rejected',
        subscription: confirmed ? {
          id: 'sub_' + Math.random().toString(36).substring(2, 10),
          name: suggestionId.includes('netflix') ? 'Netflix' : 
                suggestionId.includes('spotify') ? 'Spotify' : 
                suggestionId.includes('amazon') ? 'Amazon Prime' : 'Unknown Service',
          price: suggestionId.includes('netflix') ? 15.99 : 
                 suggestionId.includes('spotify') ? 9.99 : 
                 suggestionId.includes('amazon') ? 119 : 10.99,
          currency: 'USD',
          billing_cycle: suggestionId.includes('amazon') ? 'yearly' : 'monthly',
          provider: suggestionId.includes('netflix') ? 'Netflix' : 
                    suggestionId.includes('spotify') ? 'Spotify' : 
                    suggestionId.includes('amazon') ? 'Amazon' : 'Unknown',
          category: 'Other',
          is_manual: false,
          created_at: new Date().toISOString(),
          next_billing_date: null
        } : null
      });
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Suggestion confirmation error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request'
    });
  }
} 