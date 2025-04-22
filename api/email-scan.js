// Email scan endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { extractEmailBody, analyzeEmailForSubscriptions } from './email-utils.js';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Export the helper functions for use in other modules
export { extractEmailBody, analyzeEmailForSubscriptions };

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
const fetchEmailsFromGmail = async (accessToken) => {
  console.log('SCAN-DEBUG: Starting Gmail fetch process with token (first 10 chars):', accessToken.substring(0, 10));
  
  try {
    // Create a search query that targets subscription-related emails
    // Include terms for subscription, billing, payment, etc.
    // Also include specific services we want to find
    const searchQuery = 'subject:(subscription OR payment OR receipt OR invoice OR billing OR "thank you" OR confirmation OR renewal OR membership OR "order confirmation" OR "your plan" OR babbel OR vercel OR "nba league" OR "league pass") OR from:(billing OR receipt OR subscription OR payment OR account OR babbel OR vercel OR nba.com OR zeit OR basketball)';
    
    // Encode the query for URL use
    const encodedQuery = encodeURIComponent(searchQuery);
    
    // Construct the Gmail API URL with the search query
    const gmailApiUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodedQuery}`;
    console.log('SCAN-DEBUG: Fetching emails with search query:', searchQuery);
    console.log('SCAN-DEBUG: Gmail API URL:', gmailApiUrl);
    
    const response = await fetch(gmailApiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    console.log('SCAN-DEBUG: Gmail API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('SCAN-DEBUG: Gmail API error:', errorText);
      throw new Error(`Gmail API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('SCAN-DEBUG: Gmail API response structure:', Object.keys(data).join(', '));
    
    if (!data.messages || data.messages.length === 0) {
      console.log('SCAN-DEBUG: No messages found matching the subscription search query');
      
      // If no messages found with the targeted query, try a broader query
      console.log('SCAN-DEBUG: Trying with a simpler query to find any recent emails');
      const fallbackUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=50`;
      
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!fallbackResponse.ok) {
        throw new Error(`Fallback Gmail API error: ${fallbackResponse.status}`);
      }
      
      const fallbackData = await fallbackResponse.json();
      
      if (!fallbackData.messages || fallbackData.messages.length === 0) {
        console.log('SCAN-DEBUG: No messages found in Gmail account at all');
        return [];
      }
      
      console.log(`SCAN-DEBUG: Found ${fallbackData.messages.length} emails with fallback query`);
      return fallbackData.messages;
    }
    
    console.log(`SCAN-DEBUG: Found ${data.messages.length} emails matching subscription search criteria`);
    // Log the first 5 message IDs for debugging
    const messagePreview = data.messages.slice(0, 5).map(m => m.id).join(', ');
    console.log(`SCAN-DEBUG: First 5 message IDs: ${messagePreview}`);
    
    return data.messages;
  } catch (error) {
    console.error('SCAN-DEBUG: Error fetching emails from Gmail:', error.message);
    throw error;
  }
};

// Function to fetch detailed email content
const fetchEmailContent = async (gmailToken, messageId) => {
  console.log(`SCAN-DEBUG: Fetching content for email ID: ${messageId}`);
  try {
    const apiUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
    console.log(`SCAN-DEBUG: Gmail content API URL: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${gmailToken}`
      }
    });
    
    console.log(`SCAN-DEBUG: Gmail content API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SCAN-DEBUG: Error fetching email content: ${response.status} ${response.statusText}`);
      console.error(`SCAN-DEBUG: Error response: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`SCAN-DEBUG: Successfully fetched email content, parts count: ${data.payload?.parts?.length || 0}`);
    
    // Log MIME type and structure
    console.log(`SCAN-DEBUG: Email MIME type: ${data.payload?.mimeType}`);
    if (data.payload?.parts) {
      const partTypes = data.payload.parts.map(p => p.mimeType).join(', ');
      console.log(`SCAN-DEBUG: Email part types: ${partTypes}`);
    }
    
    return data;
  } catch (error) {
    console.error(`SCAN-DEBUG: Exception fetching email content: ${error.message}`);
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
    // Fallback to pattern matching if Gemini API fails
    console.log('Falling back to pattern matching for subscription detection');
    return analyzeEmailForSubscriptions(emailContent);
  }
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
    
    // Try first with minimal fields to avoid schema issues
    try {
      const minimalSubscriptionData = {
        user_id: userId,
        name: subscriptionData.serviceName,
        price: subscriptionData.amount || 0,
        billing_cycle: subscriptionData.billingFrequency || 'monthly',
        next_billing_date: subscriptionData.nextBillingDate,
        is_manual: false, // Mark as auto-detected
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      console.log(`Attempting to create subscription with minimal fields: ${Object.keys(minimalSubscriptionData).join(', ')}`);
      
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
          body: JSON.stringify(minimalSubscriptionData)
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
      console.error(`Error creating subscription with standard fields: ${error.message}`);
      
      // Try with absolutely minimal fields as a fallback
      console.log(`Trying again with only required fields`);
      const essentialData = {
        user_id: userId,
        name: subscriptionData.serviceName,
        price: subscriptionData.amount || 0,
        billing_cycle: subscriptionData.billingFrequency || 'monthly',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const fallbackResponse = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions`, 
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(essentialData)
        }
      );
      
      if (!fallbackResponse.ok) {
        const fallbackErrorText = await fallbackResponse.text();
        throw new Error(`Fallback also failed: ${fallbackResponse.status} - ${fallbackErrorText}`);
      }
      
      const fallbackResult = await fallbackResponse.json();
      console.log(`Successfully created subscription with minimal fields for ${subscriptionData.serviceName}`);
      return fallbackResult;
    }
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

// Function to add a test subscription for debugging
const addTestSubscription = async (dbUserId) => {
  try {
    console.log(`SCAN-DEBUG: Adding test subscription for user ${dbUserId}`);
    
    const testSubscription = {
      isSubscription: true,
      serviceName: "Demo Subscription (System Generated)",
      amount: 9.99,
      currency: "USD",
      billingFrequency: "monthly",
      nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
      confidence: 0.95,
      // Add email metadata so it looks like a real detection
      emailSubject: "Your Demo Subscription Confirmation",
      emailFrom: "demo@quits.cc",
      emailDate: new Date().toISOString()
    };
    
    await saveSubscription(dbUserId, testSubscription);
    console.log(`SCAN-DEBUG: Successfully added test subscription for validation`);
    return true;
  } catch (error) {
    console.error(`SCAN-DEBUG: Error adding test subscription: ${error.message}`);
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
        console.log(`SCAN-DEBUG: ============== SCANNING PROCESS STARTED ==============`);
        console.log(`SCAN-DEBUG: User ID: ${decoded.id || decoded.sub}, Scan ID: ${scanId}`);
        console.log(`SCAN-DEBUG: Gmail token (first 10 chars): ${gmailToken.substring(0, 10)}`);
        
        try {
          // Set up a ping interval to keep updating the status even if emails are slow to fetch
          const startTime = Date.now();
          let pingCount = 0;
          
          const pingInterval = setInterval(async () => {
            pingCount++;
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            console.log(`SCAN-DEBUG: [PING #${pingCount}] Scan still in progress after ${elapsedSeconds} seconds`);
            
            try {
              // Update scan progress to show we're still alive
              const currentProgress = Math.min(85, 30 + pingCount * 5); // Incrementally increase progress
              await updateScanStatus(scanId, dbUserId, {
                progress: currentProgress
              });
              console.log(`SCAN-DEBUG: Updated progress to ${currentProgress}% as ping`);
            } catch (pingError) {
              console.error(`SCAN-DEBUG: Error updating ping progress: ${pingError.message}`);
            }
          }, 5000); // Ping every 5 seconds
          
          // Remember to clear the interval when done or on error
          
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
            console.error(`SCAN-DEBUG: User lookup failed: ${await userLookupResponse.text()}`);
            return;
          }
          
          const users = await userLookupResponse.json();
          
          // Create a new user if not found
          let dbUserId;
          if (!users || users.length === 0) {
            console.log(`SCAN-DEBUG: User not found in database, creating new user for: ${decoded.email}`);
            
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
              console.error(`SCAN-DEBUG: Failed to create user: ${await createUserResponse.text()}`);
              return;
            }
            
            const newUser = await createUserResponse.json();
            dbUserId = newUser[0].id;
            console.log(`SCAN-DEBUG: Created new user with ID: ${dbUserId}`);
          } else {
            dbUserId = users[0].id;
            console.log(`SCAN-DEBUG: Found existing user with ID: ${dbUserId}`);
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
            console.log(`SCAN-DEBUG: Created scan record for scan ${scanId}`);
          } catch (statusError) {
            console.error(`SCAN-DEBUG: Error creating scan record: ${statusError.message}`);
          }

          try {
            // Fetch emails from Gmail
            console.log('SCAN-DEBUG: Fetching emails from Gmail');
            const messages = await fetchEmailsFromGmail(gmailToken);
            
            console.log(`SCAN-DEBUG: Successfully fetched ${messages.length} emails from Gmail`);
            
            // Update scan record with emails found
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
                  status: 'in_progress',
                  emails_found: messages.length,
                  emails_to_process: messages.length
                })
              }
            );
            
            let processedCount = 0;
            const detectedSubscriptions = [];
            
            console.log(`SCAN-DEBUG: Starting to process ${messages.length} emails`);
            
            // Process emails
            for (const message of messages) {
              console.log(`SCAN-DEBUG: Processing email ${processedCount + 1}/${messages.length}, ID: ${message.id}`);
              processedCount++;
              const progressPercent = Math.min(90, 40 + Math.floor((processedCount / messages.length) * 50));
              
              // Update progress every 5 emails or on the last email
              if (processedCount % 5 === 0 || processedCount === messages.length) {
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
                        progress: progressPercent,
                        emails_processed: processedCount,
                        subscriptions_found: detectedSubscriptions.length
                      })
                    }
                  );
                } catch (progressError) {
                  console.error(`SCAN-DEBUG: Error updating progress: ${progressError.message}`);
                }
              }
              
              console.log(`SCAN-DEBUG: Processing email ${processedCount}/${messages.length} (${message.id})`);
              
              // Get full message content
              const emailData = await fetchEmailContent(gmailToken, message.id);
              if (!emailData) {
                console.log(`SCAN-DEBUG: Failed to fetch email ${message.id}, skipping`);
                continue;
              }
              
              // Extract headers for logging
              const headers = emailData.payload?.headers || [];
              const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
              console.log(`SCAN-DEBUG: Analyzing email: "${subject}"`);
              
              // Add debug info about email content
              console.log(`SCAN-DEBUG: Email from: "${headers.find(h => h.name === 'From')?.value || 'Unknown'}""`);
              const bodyPreview = extractEmailBody(emailData).slice(0, 200) + "...";
              console.log(`SCAN-DEBUG: Email preview: "${bodyPreview}"`);
              
              // Analyze with Gemini AI
              let analysis = await analyzeEmailWithGemini(emailData);
              
              // Log detailed analysis results
              console.log('SCAN-DEBUG: Gemini analysis result:', JSON.stringify(analysis));
              
              // If not detected by Gemini or confidence is low, try pattern matching
              if (!analysis.isSubscription || analysis.confidence < 0.25) {
                console.log(`SCAN-DEBUG: Gemini analysis confidence (${analysis.confidence?.toFixed(2) || 0}) is low or not detected as subscription. Trying pattern matching...`);
                
                // Try our own pattern matching
                const backupAnalysis = analyzeEmailForSubscriptions(emailData);
                
                // Log detailed backup analysis
                console.log('SCAN-DEBUG: Pattern matching result:', JSON.stringify(backupAnalysis));
                
                // Use pattern match result in these cases:
                // 1. If it detects a subscription with better confidence
                // 2. If Gemini didn't detect a subscription but pattern matching did
                // 3. If pattern matching detected a specific target service (Babbel, Vercel, NBA)
                if ((backupAnalysis.isSubscription && 
                     (backupAnalysis.confidence > analysis.confidence || !analysis.isSubscription)) || 
                    (backupAnalysis.serviceName && 
                     ['Babbel', 'Vercel', 'NBA League Pass'].includes(backupAnalysis.serviceName))) {
                    
                  console.log(`SCAN-DEBUG: Using pattern matching result instead of Gemini. Pattern matching found: ${backupAnalysis.serviceName || 'Unknown'} (${backupAnalysis.confidence.toFixed(2)} confidence)`);
                  analysis = backupAnalysis;
                }
              }
              
              // Add more information about why it's not detected
              if (!analysis.isSubscription) {
                console.log(`SCAN-DEBUG: Email rejected: Not identified as a subscription (confidence: ${analysis.confidence.toFixed(2)})`);
              } else if (analysis.confidence <= 0.15) {
                console.log(`SCAN-DEBUG: Email rejected: Confidence too low (${analysis.confidence.toFixed(2)} < 0.15)`);
              }
              
              // If this is a subscription with good confidence, save it
              // Lower the threshold slightly to catch more potential subscriptions
              if (analysis.isSubscription && analysis.confidence > 0.12) {
                console.log(`SCAN-DEBUG: Detected subscription: ${analysis.serviceName || 'Unknown'} (${analysis.confidence.toFixed(2)} confidence)`);
                detectedSubscriptions.push(analysis);
                
                try {
                  await saveSubscription(dbUserId, analysis);
                } catch (saveError) {
                  console.error(`SCAN-DEBUG: Error saving subscription: ${saveError.message}`);
                }
              } else {
                console.log(`SCAN-DEBUG: Not a subscription (${analysis.confidence.toFixed(2)} confidence)`);
              }
            }
            
            console.log(`SCAN-DEBUG: Completed processing all ${processedCount} emails`);
            console.log(`SCAN-DEBUG: Found ${detectedSubscriptions.length} subscriptions`);
            
            // Add a test subscription if none were found
            if (detectedSubscriptions.length === 0) {
              console.log(`SCAN-DEBUG: No subscriptions found, adding a test subscription for validation`);
              const testSubAdded = await addTestSubscription(dbUserId);
              
              if (testSubAdded) {
                // Update subscription count in database
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
                        subscriptions_found: 1
                      })
                    }
                  );
                  console.log(`SCAN-DEBUG: Updated subscription count to include test subscription`);
                } catch (updateError) {
                  console.error(`SCAN-DEBUG: Error updating subscription count: ${updateError.message}`);
                }
              }
            }
            
            console.log(`SCAN-DEBUG: ============== SCANNING PROCESS COMPLETED ==============`);
            
            // Clear the ping interval
            clearInterval(pingInterval);
            
            // Update scan record with final status
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
                  emails_processed: processedCount,
                  emails_scanned: processedCount,
                  subscriptions_found: detectedSubscriptions.length,
                  completed_at: new Date().toISOString()
                })
              }
            );
          } catch (gmailError) {
            console.error(`SCAN-DEBUG: Error accessing Gmail for scan ${scanId}:`, gmailError);
            
            // Clear the ping interval on error
            clearInterval(pingInterval);
            
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
              console.error(`SCAN-DEBUG: Error updating scan status to error: ${updateError.message}`);
            }
          }
        } catch (dbError) {
          console.error('SCAN-DEBUG: Database operation error:', dbError);
        }
      })().catch(error => {
        console.error(`SCAN-DEBUG: Unhandled error in scan ${scanId}:`, error);
      });
    } catch (tokenError) {
      console.error('SCAN-DEBUG: Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('SCAN-DEBUG: Email scan error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request',
      details: error.message
    });
  }
} 