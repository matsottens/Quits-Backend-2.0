// Google OAuth Callback - Standalone handler
export default async function handler(req, res) {
  console.log('Vercel Serverless Function - Google OAuth Callback hit');
  console.log('Request URL:', req.url);
  console.log('Request origin:', req.headers.origin);
  
  // Set CORS headers for the specific origin
  const origin = req.headers.origin || '';
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    console.log('Set CORS headers for origin:', origin);
  }
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Get code from query parameters
  const { code, redirect } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }
  
  try {
    // Google OAuth configuration
    const { google } = await import('googleapis');
    
    // Use exactly the URI registered in Google Console
    const redirectUri = 'https://quits.cc/auth/callback';
    console.log('Using redirect URI:', redirectUri);
    
    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Tokens received');
    
    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2('v2');
    const userInfoResponse = await oauth2.userinfo.get({
      auth: oauth2Client,
    });
    const userInfo = userInfoResponse.data;
    
    if (!userInfo.id || !userInfo.email) {
      throw new Error('Failed to retrieve user information');
    }
    
    // Generate a JWT token
    const jwt = await import('jsonwebtoken');
    const token = jwt.sign(
      { 
        id: userInfo.id,
        email: userInfo.email
      },
      process.env.JWT_SECRET || 'your-jwt-secret-key',
      { expiresIn: '7d' }
    );
    
    // Return JSON or redirect based on the request
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        token,
        user: {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture
        }
      });
    }
    
    // Redirect to the dashboard with the token
    const redirectUrl = redirect || 'https://www.quits.cc/dashboard';
    return res.redirect(`${redirectUrl}?token=${token}`);
    
  } catch (error) {
    console.error('Error in Google callback handler:', error);
    
    // Return error in appropriate format
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
} 