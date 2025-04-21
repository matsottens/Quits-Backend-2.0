// Debug endpoint to display Gmail token from JWT
import jsonwebtoken from 'jsonwebtoken';

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Decode the token (without verification)
    const decoded = jsonwebtoken.decode(token);
    
    // Check for Gmail token
    const hasGmailToken = !!decoded?.gmail_token;
    
    // Create a safe response that doesn't expose the full token
    const safeResponse = {
      tokenInfo: {
        id: decoded?.id || 'not present',
        email: decoded?.email || 'not present',
        name: decoded?.name || 'not present',
        gmail_token_present: hasGmailToken,
        gmail_token_length: hasGmailToken ? decoded.gmail_token.length : 0,
        gmail_token_prefix: hasGmailToken ? decoded.gmail_token.substring(0, 10) + '...' : 'none',
        iat: decoded?.iat ? new Date(decoded.iat * 1000).toISOString() : 'not present',
        exp: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : 'not present'
      },
      message: 'Google token debug information',
      serverTime: new Date().toISOString(),
    };

    res.status(200).json(safeResponse);
  } catch (error) {
    console.error('Error in debug-google-token endpoint:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
} 