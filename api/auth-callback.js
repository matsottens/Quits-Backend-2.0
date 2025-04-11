// Direct handler for the auth callback that Google is using
export default function handler(req, res) {
  console.log('==== AUTH CALLBACK HANDLER CALLED ====');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Query params:', req.query);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  // Set CORS headers to allow both www and non-www versions
  const origin = req.headers.origin;
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    console.log('Setting CORS for origin:', origin);
  } else {
    // Default to www version
    res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
    console.log('Setting default CORS: https://www.quits.cc');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(200).end();
  }
  
  // Handle the OAuth code that Google returns
  const { code, state } = req.query;
  
  if (!code) {
    console.log('No code provided in auth callback');
    return res.status(400).json({
      error: 'No authorization code provided'
    });
  }
  
  console.log('Received auth code from Google');
  
  // For this demo, generate a mock token
  const token = 'mock-token-' + Date.now();
  
  // Use the state parameter if provided (contains the original origin)
  // Otherwise default to www version
  let redirectDomain = 'https://www.quits.cc';
  
  // If state contains a valid domain, use it
  if (state && (state.includes('quits.cc') || state.includes('localhost'))) {
    redirectDomain = state;
    console.log('Using origin from state:', redirectDomain);
  }
  
  // Ensure the domain doesn't have a trailing slash
  if (redirectDomain.endsWith('/')) {
    redirectDomain = redirectDomain.slice(0, -1);
  }
  
  // Redirect to the dashboard with the token
  const dashboardUrl = `${redirectDomain}/dashboard?token=${token}`;
  console.log('Redirecting to dashboard:', dashboardUrl);
  
  return res.redirect(dashboardUrl);
} 