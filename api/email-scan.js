// Email scan endpoint
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
    console.log('JWT payload keys:', Object.keys(payload));
    
    if (payload.gmail_token) {
      console.log('Found gmail_token in JWT');
      return payload.gmail_token;
    }
    
    // Check if token might be in a different field
    if (payload.access_token) {
      console.log('Found access_token in JWT, using as Gmail token');
      return payload.access_token;
    }
    
    console.error('No Gmail token found in JWT, payload:', JSON.stringify(payload, null, 2));
    return null;
  } catch (error) {
    console.error('Error extracting Gmail token:', error);
    return null;
  }
};

// Function to access Gmail API and fetch emails
const fetchEmailsFromGmail = async (gmailToken, maxResults = 100) => {
  try {
    console.log('Fetching emails with Gmail token (first 20 chars):', gmailToken.substring(0, 20) + '...');
    
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
      const errorBody = await response.text();
      console.error(`Gmail API error ${response.status}: ${errorBody}`);
      throw new Error(`Gmail API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    console.log(`Found ${data.messages?.length || 0} emails matching subscription criteria`);
    
    if (!data.messages || data.messages.length === 0) {
      console.log('No emails found that match the criteria');
      return [];
    }
    
    return data.messages;
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

// Function to analyze email with Gemini AI
const analyzeEmailWithGemini = async (emailContent) => {
  try {
    // Check if Gemini API key exists
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not found, using fallback analysis');
      return analyzeEmailForSubscriptions(emailContent);
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
        if (part.mimeType === 'text/plain' && part.body?.data) {
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

    console.log(`Analyzing email "${subject}" with Gemini AI...`);
    
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
    console.log('Gemini API response received, extracting JSON data');
    
    // Extract JSON from text (handle cases where text may contain markdown or other content)
    const jsonMatch = geminiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);
        console.log('Parsed result:', result.isSubscription ? 'Subscription detected' : 'Not a subscription');
        return result;
      } catch (parseError) {
        console.error('Error parsing Gemini response JSON:', parseError);
        console.error('Raw response:', geminiText);
        return analyzeEmailForSubscriptions(emailContent);
      }
    } else {
      console.warn('Unexpected Gemini response format, using fallback analysis');
      console.warn('Raw response:', geminiText);
      return analyzeEmailForSubscriptions(emailContent);
    }
  } catch (error) {
    console.error('Error analyzing email with Gemini:', error);
    return analyzeEmailForSubscriptions(emailContent);
  }
};

// Function to analyze email for subscription data (fallback method)
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
      if (part.mimeType === 'text/plain' && part.body?.data) {
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
  
  // Generate next billing date (today + 1 month if monthly, today + 1 year if yearly)
  const nextDate = new Date();
  if (billingCycle === 'yearly') {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  } else if (billingCycle === 'quarterly') {
    nextDate.setMonth(nextDate.getMonth() + 3);
  } else {
    // Default to monthly
    nextDate.setMonth(nextDate.getMonth() + 1);
  }
  const nextBillingDate = nextDate.toISOString().split('T')[0];
  
  // Return in Gemini format for compatibility
  if (confidence > 0.5 && (serviceName || from) && price) {
    return {
      isSubscription: true,
      serviceName: serviceName || 'Unknown Service',
      amount: price,
      currency: 'USD', // Default
      billingFrequency: billingCycle || 'monthly', // Default to monthly
      nextBillingDate,
      confidence: confidence,
    };
  }
  
  return {
    isSubscription: false,
    confidence: 0.8 // Reasonable confidence it's not a subscription
  };
};

// Function to save detected subscription to database
const saveSubscription = async (userId, subscriptionData) => {
  try {
    // First check if a similar subscription already exists
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&name=ilike.${encodeURIComponent('%' + subscriptionData.serviceName + '%')}`, 
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!checkResponse.ok) {
      const errorText = await checkResponse.text();
      console.error(`Failed to check existing subscriptions: ${errorText}`);
    } else {
      const existingSubscriptions = await checkResponse.json();
      if (existingSubscriptions && existingSubscriptions.length > 0) {
        console.log(`Subscription for ${subscriptionData.serviceName} already exists, skipping`);
  return null;
      }
    }
    
    // Create subscription using REST API
    console.log(`Creating subscription for ${subscriptionData.serviceName}`);
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
    
    const result = await response.json();
    console.log(`Successfully created subscription for ${subscriptionData.serviceName}`);
    return result;
  } catch (error) {
    console.error('Error saving subscription:', error);
    throw error;
  }
};

// Function to validate Gmail token
const validateGmailToken = async (gmailToken) => {
  try {
    // Make a simple call to Gmail API to check if token is valid
    const response = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/profile',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${gmailToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gmail token validation failed: ${errorBody}`);
      return false;
    }

    const data = await response.json();
    console.log(`Gmail token validated for email: ${data.emailAddress}`);
    return true;
  } catch (error) {
    console.error('Error validating Gmail token:', error);
    return false;
  }
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
      console.log('JWT verified successfully, decoded user:', decoded.email);
      
      // Extract Gmail token from JWT
      let gmailToken = extractGmailToken(token);
      
      // Check if we have a Gmail token directly in the request headers as fallback
      if (!gmailToken && req.headers['x-gmail-token']) {
        console.log('Using Gmail token from X-Gmail-Token header');
        gmailToken = req.headers['x-gmail-token'];
      }
      
      // Check if token is in the request body as another fallback
      if (!gmailToken && req.body && req.body.gmail_token) {
        console.log('Using Gmail token from request body');
        gmailToken = req.body.gmail_token;
      }
      
      if (!gmailToken) {
        return res.status(400).json({
          error: 'gmail_token_missing',
          message: 'No Gmail access token found in your authentication token or request. Please re-authenticate with Gmail permissions.'
        });
      }
      
      // Validate the Gmail token
      const isValidToken = await validateGmailToken(gmailToken);
      if (!isValidToken) {
        return res.status(401).json({
          error: 'gmail_token_invalid',
          message: 'The Gmail access token is invalid or expired. Please re-authenticate with Gmail permissions.'
        });
      }
      
      // Generate a scan ID
      const scanId = 'scan_' + Math.random().toString(36).substring(2, 15);
      
      // Immediately respond to client that scanning has started
      res.status(202).json({
        success: true,
        message: 'Email scan initiated successfully',
        scanId,
        estimatedTime: '30 seconds',
        user: {
          id: decoded.id || decoded.sub,
          email: decoded.email
        }
      });
      
      // Start the scanning process asynchronously
      (async () => {
        console.log(`Fetching up to 100 emails for scan ${scanId}...`);
        try {
          // Find or create user in the database
          const userLookupResponse = await fetch(
            `${supabaseUrl}/rest/v1/users?select=id,email,google_id&or=(email.eq.${encodeURIComponent(decoded.email)},google_id.eq.${encodeURIComponent(decoded.id || decoded.sub)})`, 
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
            console.error(`User lookup failed: ${await userLookupResponse.text()}`);
            return;
          }
          
          const users = await userLookupResponse.json();
          
          // Create a new user if not found
          let dbUserId;
          if (!users || users.length === 0) {
            console.log(`User not found in database, creating new user for: ${decoded.email}`);
            
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
                  google_id: decoded.id || decoded.sub,
                  name: decoded.name || decoded.email.split('@')[0],
                  avatar_url: decoded.picture || null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
              }
            );
            
            if (!createUserResponse.ok) {
              console.error(`Failed to create user: ${await createUserResponse.text()}`);
              return;
            }
            
            const newUser = await createUserResponse.json();
            dbUserId = newUser[0].id;
            console.log(`Created new user with ID: ${dbUserId}`);
          } else {
            dbUserId = users[0].id;
            console.log(`Found existing user with ID: ${dbUserId}`);
          }

          // Create a scan record initially
          try {
            await fetch(
              `${supabaseUrl}/rest/v1/scan_history`, 
              {
                method: 'POST',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  scan_id: scanId,
                  user_id: dbUserId,
                  status: 'in_progress',
                  progress: 10,
                  created_at: new Date().toISOString()
                })
              }
            );
            console.log(`Created scan record for scan ${scanId}`);
          } catch (statusError) {
            console.error(`Error creating scan record: ${statusError.message}`);
          }

          try {
            // Fetch emails from Gmail
            const emails = await fetchEmailsFromGmail(gmailToken);
            
            // Update scan progress
            try {
              await fetch(
                `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, 
                {
                  method: 'PATCH',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    progress: 30
                  })
                }
              );
            } catch (updateError) {
              console.error(`Error updating scan progress: ${updateError.message}`);
            }
            
            console.log(`Processing ${emails.length} emails for scan ${scanId}`);
            
            // Process only the most recent 10 emails to avoid overloading
            const recentEmails = emails.slice(0, 10);
            const detectedSubscriptions = [];
            
            // Process each email
            for (const message of recentEmails) {
              try {
                console.log(`Processing email ${message.id}`);
                
                // Get full message content
                const emailData = await fetchEmailContent(gmailToken, message.id);
                if (!emailData) {
                  console.log(`Failed to fetch email ${message.id}, skipping`);
                  continue;
                }
                
                // Extract headers for logging
                const headers = emailData.payload?.headers || [];
                const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                console.log(`Analyzing email: "${subject}"`);
                
                // Analyze with Gemini AI
                const analysis = await analyzeEmailWithGemini(emailData);
                
                // If this is a subscription with good confidence, save it
                if (analysis.isSubscription && analysis.confidence > 0.6) {
                  console.log(`Detected subscription: ${analysis.serviceName || 'Unknown'} (${analysis.confidence.toFixed(2)} confidence)`);
                  detectedSubscriptions.push(analysis);
                  
                  try {
                    await saveSubscription(dbUserId, analysis);
                  } catch (saveError) {
                    console.error(`Error saving subscription: ${saveError.message}`);
                  }
                } else {
                  console.log(`Not a subscription (${analysis.confidence.toFixed(2)} confidence)`);
              }
            } catch (emailError) {
              console.error(`Error processing email ${message.id}:`, emailError);
              }
            }
            
            console.log(`Scan ${scanId} complete. Detected ${detectedSubscriptions.length} subscriptions.`);
            
            // Update scan status in the database 
            try {
              await fetch(
                `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, 
                {
                  method: 'PATCH',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
            status: 'completed',
                    emails_scanned: recentEmails.length,
                    subscriptions_found: detectedSubscriptions.length,
                    completed_at: new Date().toISOString(),
                    progress: 100
                  })
                }
              );
              console.log(`Updated scan status to completed for scan ${scanId}`);
            } catch (statusError) {
              console.error(`Error updating scan status: ${statusError.message}`);
            }
          } catch (gmailError) {
            console.error(`Error accessing Gmail for scan ${scanId}:`, gmailError);
            
            // Update scan status to error
            try {
              await fetch(
                `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, 
                {
                  method: 'PATCH',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
            status: 'error',
                    error_message: gmailError.message,
                    completed_at: new Date().toISOString()
                  })
                }
              );
            } catch (updateError) {
              console.error(`Error updating scan status to error: ${updateError.message}`);
            }
          }
        } catch (dbError) {
          console.error('Database operation error:', dbError);
        }
      })().catch(error => {
        console.error(`Unhandled error in scan ${scanId}:`, error);
      });
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Email scan error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 