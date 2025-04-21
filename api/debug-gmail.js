// Debug Gmail API endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;

// Helper function to extract Gmail token from JWT
const extractGmailToken = (token) => {
  try {
    const payload = jsonwebtoken.decode(token);
    console.log('JWT payload keys:', Object.keys(payload));
    
    if (payload.gmail_token) {
      console.log('Found gmail_token in JWT');
      return payload.gmail_token;
    }
    
    // Check if token might be in a different field
    if (payload.access_token) {
      console.log('Found access_token in JWT, using as Gmail token');
      return payload.access_token;
    }
    
    console.error('No Gmail token found in JWT, payload:', JSON.stringify(payload, null, 2));
    return null;
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
    console.log('Handling OPTIONS preflight request for debug-gmail');
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
      console.log('JWT verified successfully, decoded user:', decoded.email);
      
      // Extract Gmail token from JWT
      let gmailToken = extractGmailToken(token);
      
      // Check if we have a Gmail token directly in the request headers as fallback
      if (!gmailToken && req.headers['x-gmail-token']) {
        console.log('Using Gmail token from X-Gmail-Token header');
        gmailToken = req.headers['x-gmail-token'];
      }
      
      if (!gmailToken) {
        return res.status(400).json({
          error: 'gmail_token_missing',
          message: 'No Gmail access token found in your authentication token or request',
          connected: false
        });
      }
      
      // Test Gmail API connection
      try {
        // Test connection by getting user profile
        const profileResponse = await fetch(
          'https://www.googleapis.com/gmail/v1/users/me/profile',
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${gmailToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const profileData = profileResponse.ok ? await profileResponse.json() : null;
        
        // Try to list messages
        let messagesData = null;
        let messagesError = null;
        let messageCount = 0;
        
        try {
          const messagesResponse = await fetch(
            'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${gmailToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (messagesResponse.ok) {
            messagesData = await messagesResponse.json();
            messageCount = messagesData.messages?.length || 0;
          } else {
            const errorText = await messagesResponse.text();
            messagesError = `${messagesResponse.status}: ${errorText}`;
          }
        } catch (messageError) {
          messagesError = messageError.message;
        }
        
        // Return test results
        return res.status(200).json({
          connected: profileResponse.ok,
          profile: profileResponse.ok ? profileData : null,
          profileStatus: profileResponse.status,
          messageCount,
          error: !profileResponse.ok ? await profileResponse.text() : messagesError,
          email: profileData?.emailAddress || decoded.email,
          tokenPrefix: gmailToken ? gmailToken.substring(0, 10) + '...' : null,
          tokenLength: gmailToken ? gmailToken.length : 0
        });
      } catch (gmailError) {
        console.error('Gmail API test error:', gmailError);
        return res.status(500).json({
          connected: false,
          error: gmailError.message,
          tokenPrefix: gmailToken ? gmailToken.substring(0, 10) + '...' : null,
          tokenLength: gmailToken ? gmailToken.length : 0
        });
      }
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        connected: false
      });
    }
  } catch (error) {
    console.error('Debug Gmail API error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message,
      connected: false
    });
  }
} 