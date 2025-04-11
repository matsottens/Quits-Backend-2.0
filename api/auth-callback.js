// Direct handler for the auth callback that Google is using
export default function handler(req, res) {
  console.log('==== AUTH CALLBACK HANDLER CALLED ====');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Query params:', req.query);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(200).end();
  }
  
  // Handle the OAuth code that Google returns
  const { code } = req.query;
  
  if (!code) {
    console.log('No code provided in auth callback');
    return res.status(400).json({
      error: 'No authorization code provided'
    });
  }
  
  console.log('Received auth code from Google');
  
  // Generate a simple token
  const token = `quits-token-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  console.log('Generated token:', token);
  
  // If JSON is requested, return JSON
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    console.log('Returning JSON response');
    return res.status(200).json({
      success: true,
      token,
      user: {
        id: '12345',
        email: 'user@example.com',
        name: 'Demo User'
      }
    });
  }
  
  // Otherwise return a simple HTML page
  console.log('Returning HTML response');
  
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Authentication Successful</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        text-align: center;
        margin: 0;
        padding: 20px;
        color: #333;
      }
      .card {
        max-width: 500px;
        margin: 40px auto;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        background-color: white;
      }
      h1 { color: #2563eb; margin-bottom: 16px; }
      p { margin-bottom: 24px; line-height: 1.5; }
      .spinner {
        display: inline-block;
        width: 40px;
        height: 40px;
        border: 3px solid rgba(37,99,235,0.3);
        border-radius: 50%;
        border-top-color: #2563eb;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      button {
        background-color: #2563eb;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 4px;
        font-size: 16px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      button:hover { background-color: #1d4ed8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h1>Authentication Successful</h1>
      <p>You have been successfully authenticated with Google.</p>
      <script>
        // Store the token and redirect
        localStorage.setItem('quits_auth_token', '${token}');
        
        // Also store in original format for compatibility
        localStorage.setItem('token', '${token}');
        
        // Redirect after a short delay
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1000);
      </script>
      <button onclick="window.location.href='/dashboard'">Go to Dashboard</button>
    </div>
  </body>
  </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
} 