// Direct handler for the auth callback that Google is using
export default function handler(req, res) {
  console.log('==== AUTH CALLBACK HANDLER CALLED ====');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Query params:', req.query);
  
  // Set CORS headers to allow both www and non-www versions
  const origin = req.headers.origin || 'https://www.quits.cc';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  
  // Handle the OAuth code that Google returns
  const { code } = req.query;
  
  if (!code) {
    console.log('No code provided in auth callback');
    return res.status(400).json({
      error: 'No authorization code provided'
    });
  }
  
  console.log('Received auth code from Google');
  
  // For this demo, generate a mock token
  const token = 'mock-token-' + Date.now();
  
  // Redirect to the dashboard with the token
  // Always redirect to www version for consistency
  const dashboardUrl = 'https://www.quits.cc/dashboard?token=' + token;
  console.log('Redirecting to dashboard:', dashboardUrl);
  
  return res.redirect(dashboardUrl);
} 