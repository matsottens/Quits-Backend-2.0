/**
 * Test script for email scanning with Gmail API and real data
 * 
 * To use this script:
 * 1. Run `npm run build:email` to compile the TypeScript services
 * 2. Add TEST_GMAIL_ACCESS_TOKEN=your-token to .env file
 * 3. Run `node test-email-scan.js`
 */

const { google } = require('googleapis');
const dotenv = require('dotenv');
const { summarizeEmail } = require('./dist/services/gemini.js');

dotenv.config();

// For authentication with OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// Set access token directly for testing (would need to be obtained from your user's token)
const ACCESS_TOKEN = process.env.TEST_GMAIL_ACCESS_TOKEN; // Set this in your .env file

// If no token is provided, print detailed instructions
if (!ACCESS_TOKEN) {
  console.log('\n');
  console.log('=====================================================================');
  console.log('                  GMAIL API ACCESS TOKEN NEEDED                      ');
  console.log('=====================================================================');
  console.log('To test with real Gmail data, add TEST_GMAIL_ACCESS_TOKEN to your .env file.\n');
  console.log('You can get a token by:');
  console.log('1. Going to https://developers.google.com/oauthplayground/');
  console.log('2. Select "Gmail API v1" and choose https://www.googleapis.com/auth/gmail.readonly scope');
  console.log('3. Click "Authorize APIs" and complete the OAuth flow');
  console.log('4. On the next screen, click "Exchange authorization code for tokens"');
  console.log('5. Copy the "Access token" value');
  console.log('6. Add it to your .env file as TEST_GMAIL_ACCESS_TOKEN=your-token-here');
  console.log('7. Run this script again with: node test-email-scan.js\n');
  console.log('Example .env line:');
  console.log('TEST_GMAIL_ACCESS_TOKEN=ya29.a0AVvZ...  # your long token here');
  console.log('=====================================================================\n');
  process.exit(1);
}

async function testEmailScanning() {
  try {
    console.log('Starting email scan test with Gmail API');
    
    // Set up Gmail API with the access token
    oauth2Client.setCredentials({ access_token: ACCESS_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Query for potential subscription emails (limited to 5 for testing)
    const query = 'subject:(subscription OR receipt OR invoice OR payment OR billing)';
    console.log(`Searching emails with query: ${query}`);
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
      q: query
    });
    
    const messages = response.data.messages;
    if (!messages || messages.length === 0) {
      console.log('No matching emails found. Try a different query or check your Gmail account.');
      return;
    }
    
    console.log(`\n✅ Success! Found ${messages.length} potential subscription emails to analyze\n`);
    
    // Process each message
    for (const message of messages) {
      console.log('\n---------------------------------------------');
      console.log(`Processing email ID: ${message.id}`);
      
      // Get full message content
      const emailData = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });
      
      // Extract headers for context
      const headers = emailData.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      
      console.log(`From: ${from}`);
      console.log(`Subject: ${subject}`);
      console.log(`Date: ${date}`);
      
      // Extract email content
      const content = extractEmailContent(emailData.data);
      if (!content) {
        console.log('No readable content found in this email');
        continue;
      }
      
      console.log(`Email content extracted (${content.length} characters)`);
      
      // Add email metadata to provide context for the analysis
      const emailWithMetadata = `
From: ${from}
To: me
Subject: ${subject}
Date: ${date}

${content}
      `;
      
      // Analyze with Gemini
      console.log('Analyzing with Gemini AI...');
      const startTime = Date.now();
      const analysis = await summarizeEmail(emailWithMetadata);
      const duration = Date.now() - startTime;
      
      console.log(`Analysis completed in ${duration}ms`);
      console.log('Result:', JSON.stringify(analysis, null, 2));
      
      if (analysis.isSubscription) {
        console.log('✅ Subscription detected');
        console.log(`Service: ${analysis.serviceName}`);
        console.log(`Price: ${analysis.amount || analysis.price} ${analysis.currency}`);
        console.log(`Billing: ${analysis.billingFrequency || analysis.billingCycle}`);
        if (analysis.nextBillingDate) {
          console.log(`Next billing: ${analysis.nextBillingDate}`);
        }
      } else {
        console.log('❌ Not detected as a subscription');
      }
    }
    
  } catch (error) {
    console.error('Error during email scan test:', error);
    if (error.response) {
      console.error('API error details:', error.response.data);
    }
  }
}

/**
 * Extract the content from a Gmail message
 */
function extractEmailContent(message) {
  if (!message || !message.payload) {
    return null;
  }

  // Helper function to decode base64
  const decodeBase64 = (data) => {
    try {
      return Buffer.from(data, 'base64url').toString('utf8');
    } catch (error) {
      try {
        // Fallback to standard base64
        return Buffer.from(data, 'base64').toString('utf8');
      } catch (e) {
        console.error('Base64 decoding failed completely');
        return '';
      }
    }
  };

  // Find text/plain parts
  const findPlainTextPart = (parts) => {
    if (!parts) return null;
    
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      
      if (part.parts) {
        const nestedResult = findPlainTextPart(part.parts);
        if (nestedResult) return nestedResult;
      }
    }
    
    return null;
  };

  // Find HTML parts if text not available
  const findHtmlTextPart = (parts) => {
    if (!parts) return null;
    
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const htmlContent = decodeBase64(part.body.data);
        return htmlToPlainText(htmlContent);
      }
      
      if (part.parts) {
        const nestedResult = findHtmlTextPart(part.parts);
        if (nestedResult) return nestedResult;
      }
    }
    
    return null;
  };

  // Convert HTML to plain text
  const htmlToPlainText = (html) => {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Extract content from the message
  if (message.payload.body?.data) {
    return decodeBase64(message.payload.body.data);
  }

  if (message.payload.parts) {
    const plainText = findPlainTextPart(message.payload.parts);
    if (plainText) return plainText;
    
    const htmlText = findHtmlTextPart(message.payload.parts);
    if (htmlText) return htmlText;
  }

  if (message.snippet) {
    return message.snippet;
  }

  return null;
}

// Execute the test
testEmailScanning()
  .then(() => console.log('\nTest completed successfully! You can now integrate this into your application.'))
  .catch(err => console.error('Test failed:', err)); 