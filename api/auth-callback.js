// Direct handler for the auth callback that Google is using
export default function handler(req, res) {
  console.log('==== AUTH CALLBACK HANDLER CALLED ====');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Query params:', req.query);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  // Set CORS headers to allow requests from all origins
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
  
  // For this implementation, generate a simple token
  // In a real implementation, you would exchange the code for access/refresh tokens
  const token = `quits-token-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  console.log('Generated token:', token);
  
  // Determine if this is a JSON or HTML request
  const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
  
  if (acceptsJson) {
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
  
  // If the frontend is on the same host as this callback,
  // we can simply render the success page with a script to store the token
  console.log('Rendering HTML success page');
  
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Authentication Successful</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 500px;
        margin: 0 auto;
        padding: 20px;
        text-align: center;
      }
      .card {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        padding: 30px;
        margin: 30px 0;
      }
      h1 {
        color: #4a5568;
        margin-bottom: 16px;
      }
      .spinner {
        display: inline-block;
        width: 50px;
        height: 50px;
        border: 3px solid rgba(0, 0, 0, 0.1);
        border-radius: 50%;
        border-top-color: #3498db;
        animation: spin 1s ease-in-out infinite;
        margin-bottom: 20px;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .btn {
        display: inline-block;
        background-color: #3498db;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        text-decoration: none;
        margin-top: 20px;
        border: none;
        cursor: pointer;
        font-size: 16px;
        transition: background-color 0.2s;
      }
      .btn:hover {
        background-color: #2980b9;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h1>Authentication Successful!</h1>
      <p>You have been successfully authenticated with Google.</p>
      <p>Redirecting you to the dashboard...</p>
      <button class="btn" id="dashboardBtn">Go to Dashboard</button>
    </div>
    
    <script>
      // Store the token in localStorage
      localStorage.setItem('quits_auth_token', '${token}');
      
      // Redirect to dashboard 
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
      
      // Manual redirect button
      document.getElementById('dashboardBtn').addEventListener('click', () => {
        window.location.href = '/dashboard';
      });
    </script>
  </body>
  </html>
  `;
  
  // Set content type to HTML and send the response
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
} 