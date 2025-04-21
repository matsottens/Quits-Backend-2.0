// Email scan for subscriptions using Gemini AI
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

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

// Function to fetch emails from Gmail
const fetchEmails = async (gmailToken, maxResults = 100) => {
  try {
    // Call Gmail API to get a list of recent emails with subscription-related filters
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

// Function to analyze email content with Gemini AI
const analyzeEmailWithGemini = async (emailContent) => {
  try {
    // Check if Gemini API key exists
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not found, using fallback analysis');
      return fallbackEmailAnalysis(emailContent);
    }

    // Format email data for the prompt
    const headers = emailContent.payload.headers || [];
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

    // Extract email body
    let body = '';
    if (emailContent.payload.body && emailContent.payload.body.data) {
      // Decode base64 data
      body = Buffer.from(emailContent.payload.body.data, 'base64').toString('utf-8');
    } else if (emailContent.payload.parts) {
      // Handle multipart messages
      for (const part of emailContent.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    // Format the complete email
    const formattedEmail = `
From: ${from}
Subject: ${subject}
Date: ${date}

${body}
    `;

    // Call Gemini API
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `
You are a specialized AI system designed to analyze emails and identify subscription services.

Analyze the following email content to determine if it relates to a subscription service.
Look for indicators such as:
- Regular payment mentions (monthly, annually, etc.)
- Subscription confirmation or renewal notices
- Billing details for recurring services
- Trial period information
- Account or membership information

If this email is about a subscription, extract the following details:
- Service name: The name of the subscription service
- Price: The amount charged (ignore one-time fees, focus on recurring charges)
- Currency: USD, EUR, etc.
- Billing frequency: monthly, yearly, quarterly, weekly, etc.
- Next billing date: When the next payment will occur (in YYYY-MM-DD format if possible)

FORMAT YOUR RESPONSE AS A JSON OBJECT with the following structure:

For subscription emails:
{
  "isSubscription": true,
  "serviceName": "The service name",
  "amount": 19.99,
  "currency": "USD",
  "billingFrequency": "monthly", 
  "nextBillingDate": "YYYY-MM-DD",
  "confidence": 0.95 // Your confidence level between 0 and 1
}

For non-subscription emails:
{
  "isSubscription": false,
  "confidence": 0.95 // Your confidence level between 0 and 1
}

Always consider the entire email context, including sender, subject line, and body content when making your determination.

Email Content:
--- START EMAIL CONTENT ---
${formattedEmail}
--- END EMAIL CONTENT ---

JSON Output:
`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // Extract text from response
    const geminiText = data.candidates[0].content.parts[0].text;
    
    // Extract JSON from text (handle cases where text may contain markdown or other content)
    const jsonMatch = geminiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('Error parsing Gemini response JSON:', parseError);
        return fallbackEmailAnalysis(emailContent);
      }
    } else {
      console.warn('Unexpected Gemini response format, using fallback analysis');
      return fallbackEmailAnalysis(emailContent);
    }
  } catch (error) {
    console.error('Error analyzing email with Gemini:', error);
    return fallbackEmailAnalysis(emailContent);
  }
};

// Fallback analysis when Gemini is unavailable
const fallbackEmailAnalysis = (email) => {
  // Get headers
  const headers = email.payload.headers || [];
  const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
  const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
  
  // Get email body
  let body = '';
  if (email.payload.body && email.payload.body.data) {
    body = Buffer.from(email.payload.body.data, 'base64').toString('utf-8');
  } else if (email.payload.parts) {
    for (const part of email.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }

  // Simple keyword matching
  const lowerContent = (subject + ' ' + from + ' ' + body).toLowerCase();
  
  // Check if this looks like a subscription email
  const subscriptionKeywords = ['subscription', 'billing', 'payment', 'renew', 'monthly', 'yearly', 'annual'];
  const isSubscription = subscriptionKeywords.some(keyword => lowerContent.includes(keyword));
  
  if (!isSubscription) {
    return { 
      isSubscription: false,
      confidence: 0.7
    };
  }
  
  // Try to extract service name
  let serviceName = 'Unknown Service';
  const services = [
    'Netflix', 'Amazon', 'Prime', 'Spotify', 'Apple', 'Disney', 'Hulu', 'HBO', 
    'YouTube', 'Adobe', 'Microsoft', 'Google', 'Dropbox', 'iCloud', 'Slack',
    'Zoom', 'GitHub', 'Notion', 'Figma'
  ];
  
  for (const service of services) {
    if (lowerContent.includes(service.toLowerCase())) {
      serviceName = service;
      break;
    }
  }
  
  // Try to extract price
  let price = 0;
  const priceRegex = /\$(\d+(\.\d{2})?)/;
  const priceMatch = body.match(priceRegex);
  if (priceMatch && priceMatch[1]) {
    price = parseFloat(priceMatch[1]);
  }
  
  // Determine billing frequency
  let billingFrequency = 'monthly';
  if (lowerContent.includes('year') || lowerContent.includes('annual')) {
    billingFrequency = 'yearly';
  } else if (lowerContent.includes('week')) {
    billingFrequency = 'weekly';
  }
  
  // Generate next billing date (today + 1 month)
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);
  const nextBillingDate = nextDate.toISOString().split('T')[0];
  
  return {
    isSubscription: true,
    serviceName,
    amount: price,
    currency: 'USD',
    billingFrequency,
    nextBillingDate,
    confidence: 0.8
  };
};

// Function to save detected subscription to database
const saveSubscription = async (userId, subscriptionData) => {
  try {
    // Create subscription using REST API
    const response = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions`, 
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          user_id: userId,
          name: subscriptionData.serviceName,
          price: subscriptionData.amount,
          billing_cycle: subscriptionData.billingFrequency,
          next_billing_date: subscriptionData.nextBillingDate,
          category: 'other', // Default category
          is_manual: false, // Mark as auto-detected
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: 'email_scan',
          confidence: subscriptionData.confidence
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase API error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving subscription:', error);
    throw error;
  }
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for scan-subscriptions');
    return res.status(204).end();
  }
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  console.log('Processing scan-subscriptions request');

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify the JWT
    try {
      const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
      const decoded = verify(token, jwtSecret);
      const userId = decoded.id || decoded.sub; // Use sub as fallback
      
      if (!userId) {
        return res.status(401).json({ error: 'Invalid user ID in token' });
      }
      
      // Extract Gmail token
      const gmailToken = extractGmailToken(token);
      if (!gmailToken) {
        return res.status(400).json({
          error: 'gmail_token_missing',
          message: 'No Gmail access token found in your authentication token. Please re-authenticate with Gmail permissions.'
        });
      }
      
      // Generate a scan ID
      const scanId = 'scan_' + Math.random().toString(36).substring(2, 15);
      
      // Immediately respond to client that scanning has started
      res.status(202).json({
        success: true,
        message: 'Email scanning started',
        scanId
      });
      
      // First, look up the database user ID
      try {
        const userLookupResponse = await fetch(
          `${supabaseUrl}/rest/v1/users?select=id,email,google_id&or=(email.eq.${encodeURIComponent(decoded.email)},google_id.eq.${encodeURIComponent(userId)})`, 
          {
            method: 'GET',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (!userLookupResponse.ok) {
          const errorText = await userLookupResponse.text();
          console.error('User lookup failed:', errorText);
          throw new Error(`User lookup failed: ${errorText}`);
        }
        
        const users = await userLookupResponse.json();
        
        // Create a new user if not found
        let dbUserId;
        if (!users || users.length === 0) {
          console.log(`User not found in database, creating new user for: ${decoded.email}`);
          
          // Create a new user
          const createUserResponse = await fetch(
            `${supabaseUrl}/rest/v1/users`, 
            {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({
                email: decoded.email,
                google_id: userId,
                name: decoded.name || decoded.email.split('@')[0],
                avatar_url: decoded.picture || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
            }
          );
          
          if (!createUserResponse.ok) {
            const errorText = await createUserResponse.text();
            console.error('Failed to create user:', errorText);
            throw new Error(`Failed to create user: ${errorText}`);
          }
          
          const newUser = await createUserResponse.json();
          dbUserId = newUser[0].id;
          console.log(`Created new user with ID: ${dbUserId}`);
        } else {
          dbUserId = users[0].id;
          console.log(`Found existing user with ID: ${dbUserId}`);
        }
        
        // Continue with email scanning in the background
        (async () => {
          try {
            console.log(`Starting email scan for user ${dbUserId} (scan ID: ${scanId})`);
            
            // Fetch email list from Gmail
            const emails = await fetchEmails(gmailToken);
            console.log(`Found ${emails.length} potentially relevant emails`);
            
            // Limit to 10 most recent emails for analysis
            const emailsToProcess = emails.slice(0, 10);
            const detectedSubscriptions = [];
            
            // Process each email
            for (const email of emailsToProcess) {
              try {
                console.log(`Processing email ${email.id}`);
                
                // Fetch full email content
                const emailContent = await fetchEmailContent(gmailToken, email.id);
                if (!emailContent) {
                  console.log(`Skipping email ${email.id} - could not fetch content`);
                  continue;
                }
                
                // Analyze email with Gemini AI
                const analysis = await analyzeEmailWithGemini(emailContent);
                console.log(`Analysis result for email ${email.id}:`, analysis.isSubscription ? 'Subscription detected' : 'Not a subscription');
                
                // If this is a subscription with high confidence, add it to detected subscriptions
                if (analysis.isSubscription && analysis.confidence > 0.7) {
                  detectedSubscriptions.push(analysis);
                  
                  // Save the subscription to the database
                  try {
                    await saveSubscription(dbUserId, analysis);
                    console.log(`Saved subscription: ${analysis.serviceName}`);
                  } catch (saveError) {
                    console.error(`Error saving subscription from email ${email.id}:`, saveError);
                  }
                }
              } catch (emailError) {
                console.error(`Error processing email ${email.id}:`, emailError);
              }
            }
            
            console.log(`Email scan completed. Detected ${detectedSubscriptions.length} subscriptions.`);
          } catch (scanError) {
            console.error(`Error during email scan (ID: ${scanId}):`, scanError);
          }
        })();
      } catch (dbError) {
        console.error('Database operation error:', dbError);
        // Error already handled by the 202 response above
      }
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Scan subscriptions error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 