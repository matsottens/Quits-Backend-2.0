/**
 * Script to generate a Gmail API access token for testing
 * Run with: node create-test-token.js
 */

const { google } = require('googleapis');
const dotenv = require('dotenv');
const fs = require('fs');
const http = require('http');
const url = require('url');
const open = require('open');

dotenv.config();

// Get your OAuth credentials
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = 'http://localhost:3333/oauth2callback';

if (!clientId || !clientSecret) {
  console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env file');
  process.exit(1);
}

// Create OAuth client
const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

// Generate the authentication URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  prompt: 'consent' // Force to get refresh token
});

console.log(`\n=== Gmail API Token Generator ===\n`);
console.log(`1. Opening browser for Gmail API authorization...`);

// Open the authorization URL in the default browser
open(authUrl);

// Create a simple HTTP server to handle the OAuth callback
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    
    // Handle the OAuth callback
    if (parsedUrl.pathname === '/oauth2callback') {
      // Get the authorization code from the callback
      const code = parsedUrl.query.code;
      
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Error: Missing authorization code</h1>');
        return;
      }
      
      // Exchange the authorization code for tokens
      console.log(`\n2. Exchanging authorization code for tokens...`);
      const { tokens } = await oauth2Client.getToken(code);
      
      if (!tokens.access_token) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Error: Failed to obtain access token</h1>');
        return;
      }
      
      // Update the .env file with the token
      console.log(`\n3. Successfully obtained access token!`);
      
      // Add the token to .env
      const envPath = './.env';
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Check if TEST_GMAIL_ACCESS_TOKEN already exists in .env
      if (envContent.includes('TEST_GMAIL_ACCESS_TOKEN=')) {
        // Replace existing token
        envContent = envContent.replace(
          /TEST_GMAIL_ACCESS_TOKEN=.*/,
          `TEST_GMAIL_ACCESS_TOKEN=${tokens.access_token}`
        );
      } else {
        // Add new token
        envContent += `\n# Test Gmail API Access Token (generated on ${new Date().toLocaleString()})\nTEST_GMAIL_ACCESS_TOKEN=${tokens.access_token}\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      
      // Print success message
      console.log(`4. Added token to .env file`);
      
      // Return success page to the user
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail API Token Generated</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; line-height: 1.6; }
            .success { color: green; font-weight: bold; }
            pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>Gmail API Token Generated Successfully!</h1>
          
          <p class="success">✅ Token has been added to your .env file</p>
          
          <p>You can now run the email scan test with:</p>
          <pre>node test-email-scan.js</pre>
          
          <p>This window can be closed.</p>
        </body>
        </html>
      `);
      
      // Close the server after handling the callback
      setTimeout(() => {
        server.close();
        console.log(`\n5. Done! You can now run: node test-email-scan.js\n`);
        process.exit(0);
      }, 1000);
    }
  } catch (error) {
    console.error('Error during OAuth flow:', error);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Error</h1><p>${error.message}</p>`);
    
    setTimeout(() => {
      server.close();
      process.exit(1);
    }, 1000);
  }
});

// Start the server on port 3333
server.listen(3333, () => {
  console.log(`Server running at http://localhost:3333/`);
});

console.log(`\nWaiting for authorization...\n`); 