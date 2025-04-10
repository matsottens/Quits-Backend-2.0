// Direct serverless handler that should be easy to deploy
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle different paths directly
  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;
  
  if (path === '/api/health' || path === '/api/test') {
    return res.status(200).json({
      status: 'ok',
      message: 'API is working',
      timestamp: new Date().toISOString(),
      path: path
    });
  }
  
  if (path.includes('/google-proxy') && req.query.code) {
    try {
      // For demonstration, this doesn't actually call Google
      // But it returns a response format that the frontend expects
      return res.status(200).json({
        success: true,
        token: "mock-token-for-testing-" + Date.now(),
        user: {
          id: "123",
          email: "user@example.com",
          name: "Test User",
          picture: "https://example.com/avatar.jpg"
        }
      });
    } catch (error) {
      return res.status(500).json({ error: 'Authentication failed', message: error.message });
    }
  }
  
  if (path.includes('/auth/google/callback') && req.query.code) {
    const redirectUrl = req.query.redirect || 'https://www.quits.cc/dashboard';
    return res.redirect(`${redirectUrl}?token=mock-token-for-testing-${Date.now()}`);
  }
  
  return res.status(200).json({
    message: 'Catch-all route hit',
    path,
    time: new Date().toISOString()
  });
} 