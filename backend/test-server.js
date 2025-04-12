/**
 * Simple test server for debugging OAuth callback issues
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes with credential support
app.use(cors({
  origin: ['http://localhost:5173', 'https://quits.cc', 'https://www.quits.cc'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true // Allow credentials
}));

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query:', JSON.stringify(req.query, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  next();
});

// Create test HTML file
const createTestHtml = () => {
  const fs = require('fs');
  const dir = path.join(__dirname, 'public');
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const htmlPath = path.join(dir, 'index.html');
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OAuth Test</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
      pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
      button { padding: 10px 15px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>Google OAuth Test</h1>
    
    <div>
      <button id="loginBtn">Login with Google</button>
    </div>
    
    <h2>Logs:</h2>
    <div id="logs"></div>
    
    <script>
      // Log to page
      function log(message) {
        const logsEl = document.getElementById('logs');
        const logEntry = document.createElement('pre');
        
        if (typeof message === 'object') {
          logEntry.textContent = JSON.stringify(message, null, 2);
        } else {
          logEntry.textContent = message;
        }
        
        logsEl.appendChild(logEntry);
      }
      
      // Check for callback parameters
      function checkCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const token = urlParams.get('token');
        const error = urlParams.get('error');
        
        if (code) {
          log('Authorization code received:');
          log({ code: code.substring(0, 10) + '...' });
          
          // Send to backend
          fetch('/auth/google/callback?code=' + code)
            .then(response => {
              log('Backend response status: ' + response.status);
              return response.json().catch(() => null);
            })
            .then(data => {
              if (data) {
                log('Backend response:');
                log(data);
              } else {
                log('No JSON response from backend');
              }
            })
            .catch(err => {
              log('Error calling backend: ' + err.message);
            });
        }
        
        if (token) {
          log('Token received:');
          log({ token: token.substring(0, 10) + '...' });
        }
        
        if (error) {
          log('Error received:');
          log({ error });
        }
      }
      
      // Handle login button
      document.getElementById('loginBtn').addEventListener('click', () => {
        // IMPORTANT: Update with your own Google Client ID
        const clientId = '876318532111-trbg50e1efq2n4d7jfk91rdtmhmj7jj5.apps.googleusercontent.com';
        const redirectUri = window.location.origin;
        
        const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'email profile',
          access_type: 'offline',
          prompt: 'consent'
        });
        
        log('Redirecting to Google OAuth...');
        log({ redirectUri });
        
        window.location.href = googleAuthUrl + '?' + params.toString();
      });
      
      // Check for callback params on page load
      window.addEventListener('load', checkCallback);
    </script>
  </body>
  </html>
  `;
  
  fs.writeFileSync(htmlPath, html);
  console.log(`Created test HTML file at ${htmlPath}`);
};

// Google OAuth callback endpoint
app.get('/auth/google/callback', (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' });
  }
  
  console.log('=== Google callback received ===');
  console.log('Code:', code);
  
  // In a real app, you would exchange the code for tokens
  // For this test, just return success
  res.json({
    success: true,
    message: 'Authorization code received successfully',
    code_prefix: code.substring(0, 10) + '...',
    timestamp: new Date().toISOString()
  });
});

// Also handle /api/auth/google/callback
app.get('/api/auth/google/callback', (req, res) => {
  const code = req.query.code;
  const redirect = req.query.redirect;
  
  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' });
  }
  
  console.log('=== Google callback received at /api path ===');
  console.log('Code:', code.substring(0, 10) + '...');
  console.log('Redirect:', redirect);
  
  // Generate a mock token for testing
  const token = 'test_' + Math.random().toString(36).substring(2, 15);
  
  // In a real app, you would exchange the code for tokens
  // For this test, just return a token
  res.json({
    success: true,
    message: 'Authorization code received successfully at /api path',
    code_prefix: code.substring(0, 10) + '...',
    token: token,
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User'
    },
    timestamp: new Date().toISOString()
  });
});

// Wildcard route to catch all google/callback paths
app.get('*/google/callback', (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' });
  }
  
  console.log('=== Google callback received at wildcard path ===');
  console.log('Path:', req.path);
  console.log('Code:', code);
  
  // In a real app, you would exchange the code for tokens
  // For this test, just return success
  res.json({
    success: true,
    message: `Authorization code received successfully at path: ${req.path}`,
    code_prefix: code.substring(0, 10) + '...',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create test HTML file
createTestHtml();

// Start server
app.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
}); 