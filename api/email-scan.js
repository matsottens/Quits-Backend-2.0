// Email scan endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;

// Helper function to extract Gmail token from JWT
const extractGmailToken = (token) => {
  try {
    const payload = jsonwebtoken.decode(token);
    return payload.gmail_token || null;
  } catch (error) {
    console.error('Error extracting Gmail token:', error);
    return null;
  }
};

// Function to access Gmail API and fetch emails
const fetchEmailsFromGmail = async (gmailToken, maxResults = 100) => {
  try {
    // Call Gmail API to get a list of recent emails
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=from:(billing OR receipt OR subscription OR payment OR invoice)`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${gmailToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Error fetching emails from Gmail:', error);
    throw error;
  }
};

// Function to fetch the content of a specific email
const fetchEmailContent = async (gmailToken, messageId) => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${gmailToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching email content for ${messageId}:`, error);
    return null;
  }
};

// Function to analyze email for subscription data
const analyzeEmailForSubscriptions = (email) => {
  // Get headers
  const headers = email.payload.headers || [];
  const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
  const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
  const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
  
  // Get email body
  let body = '';
  if (email.payload.body && email.payload.body.data) {
    // Decode base64 data
    body = Buffer.from(email.payload.body.data, 'base64').toString('utf-8');
  } else if (email.payload.parts) {
    // Handle multipart messages
    for (const part of email.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }

  // Basic heuristic analysis - look for subscription patterns
  const subscriptionPatterns = [
    { regex: /thank you for( your)? (subscribing|subscription)/i, weight: 0.7 },
    { regex: /your (subscription|membership|plan)/i, weight: 0.6 },
    { regex: /billing (information|confirmation|receipt)/i, weight: 0.8 },
    { regex: /welcome to/i, weight: 0.5 },
    { regex: /subscription confirmation/i, weight: 0.9 },
    { regex: /payment (confirmed|processed|receipt)/i, weight: 0.7 },
    { regex: /monthly|yearly|weekly|quarterly/i, weight: 0.5 },
    { regex: /invoice/i, weight: 0.6 },
    { regex: /next billing date/i, weight: 0.8 },
    { regex: /renewal/i, weight: 0.7 },
  ];

  // Pricing patterns
  const priceRegex = /\$([\d,]+\.\d{2})|(\d+\.\d{2}) (USD|EUR|GBP)/g;
  
  // Subscription service name patterns
  const serviceNamePatterns = [
    { regex: /netflix/i, name: 'Netflix' },
    { regex: /spotify/i, name: 'Spotify' },
    { regex: /apple music/i, name: 'Apple Music' },
    { regex: /amazon prime/i, name: 'Amazon Prime' },
    { regex: /hulu/i, name: 'Hulu' },
    { regex: /disney\+/i, name: 'Disney+' },
    { regex: /youtube premium/i, name: 'YouTube Premium' },
    { regex: /hbo max/i, name: 'HBO Max' },
    { regex: /paramount\+/i, name: 'Paramount+' },
    { regex: /peacock/i, name: 'Peacock' },
  ];

  // Billing cycle patterns
  const billingCyclePatterns = [
    { regex: /monthly|per month|each month/i, cycle: 'monthly' },
    { regex: /yearly|per year|annual|annually/i, cycle: 'yearly' },
    { regex: /weekly|per week/i, cycle: 'weekly' },
    { regex: /quarterly/i, cycle: 'quarterly' },
  ];

  // Calculate confidence score based on patterns
  let confidence = 0;
  for (const pattern of subscriptionPatterns) {
    if (pattern.regex.test(subject) || pattern.regex.test(body)) {
      confidence += pattern.weight;
    }
  }
  confidence = Math.min(confidence, 0.95); // Cap at 0.95
  
  // Extract price
  const priceMatches = [...body.matchAll(priceRegex)];
  let price = null;
  if (priceMatches.length > 0) {
    // Use the first price found or the most likely one
    const priceStr = priceMatches[0][1] || priceMatches[0][2];
    price = parseFloat(priceStr.replace(',', ''));
  }
  
  // Extract service name
  let serviceName = null;
  for (const pattern of serviceNamePatterns) {
    if (pattern.regex.test(subject) || pattern.regex.test(from) || pattern.regex.test(body)) {
      serviceName = pattern.name;
      break;
    }
  }
  
  // If no match from patterns, try to extract from the sender
  if (!serviceName && from) {
    // Extract company name from email address
    const emailMatch = from.match(/@([^>]+)\.com/i);
    if (emailMatch && emailMatch[1]) {
      serviceName = emailMatch[1].charAt(0).toUpperCase() + emailMatch[1].slice(1);
    } else {
      // Try to extract from the sender name
      const nameMatch = from.match(/^"?([^"<]+)/);
      if (nameMatch && nameMatch[1]) {
        serviceName = nameMatch[1].trim();
      }
    }
  }
  
  // Extract billing cycle
  let billingCycle = null;
  for (const pattern of billingCyclePatterns) {
    if (pattern.regex.test(body)) {
      billingCycle = pattern.cycle;
      break;
    }
  }
  
  // Return subscription data if confidence is high enough
  if (confidence > 0.5 && (serviceName || from) && price) {
    return {
      email_subject: subject,
      email_from: from,
      email_date: date,
      service_name: serviceName || 'Unknown Service',
      price: price,
      currency: 'USD', // Default
      billing_cycle: billingCycle || 'monthly', // Default to monthly
      confidence: confidence,
      next_billing_date: null, // Hard to extract reliably
    };
  }
  
  return null;
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
    console.log('Handling OPTIONS preflight request for email/scan');
    return res.status(204).end();
  }
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    // Check for POST method
    if (req.method !== 'POST') {
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
      
      // Extract Gmail token from JWT
      const gmailToken = extractGmailToken(token);
      if (!gmailToken) {
        return res.status(400).json({
          error: 'gmail_token_missing',
          message: 'No Gmail access token found in your authentication token. Please re-authenticate with Gmail permissions.'
        });
      }
      
      // Generate a scan ID
      const scanId = 'scan_' + Math.random().toString(36).substring(2, 15);
      
      // Start email scanning process asynchronously
      (async () => {
        try {
          // Store the scan status in a global cache or database (mock for now)
          global.scanStatus = global.scanStatus || {};
          global.scanStatus[scanId] = {
            status: 'in_progress',
            progress: 10,
            userId: decoded.id,
            startTime: Date.now(),
            results: null
          };
          
          // Fetch emails from Gmail
          const limit = req.body?.limit || 100;
          console.log(`Fetching up to ${limit} emails for scan ${scanId}...`);
          const messages = await fetchEmailsFromGmail(gmailToken, limit);
          
          // Update progress
          global.scanStatus[scanId].progress = 30;
          
          // Process each email to look for subscriptions
          console.log(`Processing ${messages.length} emails for scan ${scanId}...`);
          const subscriptions = [];
          let processedCount = 0;
          
          for (const message of messages.slice(0, 50)) { // Process max 50 to avoid rate limits
            try {
              processedCount++;
              global.scanStatus[scanId].progress = 30 + Math.floor((processedCount / 50) * 60);
              
              // Fetch email content
              const email = await fetchEmailContent(gmailToken, message.id);
              if (!email) continue;
              
              // Analyze email for subscription data
              const subscriptionData = analyzeEmailForSubscriptions(email);
              if (subscriptionData) {
                subscriptions.push({
                  id: `sub_${Math.random().toString(36).substring(2, 10)}`,
                  ...subscriptionData
                });
              }
            } catch (emailError) {
              console.error(`Error processing email ${message.id}:`, emailError);
              // Continue with next email
            }
          }
          
          // Update scan status with results
          global.scanStatus[scanId] = {
            ...global.scanStatus[scanId],
            status: 'completed',
            progress: 100,
            completedAt: Date.now(),
            results: {
              totalEmailsScanned: processedCount,
              subscriptionsFound: subscriptions
            }
          };
          
          console.log(`Scan ${scanId} completed, found ${subscriptions.length} subscriptions`);
        } catch (scanError) {
          console.error(`Error during scan ${scanId}:`, scanError);
          // Update scan status with error
          global.scanStatus = global.scanStatus || {};
          global.scanStatus[scanId] = {
            ...global.scanStatus[scanId],
            status: 'error',
            error: scanError.message
          };
        }
      })();
      
      // Respond immediately with the scan ID
      return res.status(202).json({
        success: true,
        message: 'Email scan initiated successfully',
        scanId: scanId,
        estimatedTime: '30 seconds',
        user: {
          email: decoded.email
        }
      });
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Email scan error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request'
    });
  }
} 