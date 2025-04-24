// Email scan endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { extractEmailBody, analyzeEmailForSubscriptions, parseEmailHeaders } from './email-utils.js';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

// Add logging to help debug
console.log(`Email-scan: Supabase URL defined: ${!!supabaseUrl}`);
console.log(`Email-scan: Supabase key defined: ${!!supabaseKey}`);
console.log(`Email-scan: Using SUPABASE_SERVICE_ROLE_KEY: ${!!supabaseServiceRoleKey}`);
console.log(`Email-scan: Using SUPABASE_SERVICE_KEY: ${!!supabaseServiceKey}`);

// Helper function to extract Gmail token from JWT
const extractGmailToken = (token) => {
  try {
    const payload = jsonwebtoken.decode(token);
    console.log('JWT payload keys:', Object.keys(payload));
    
    // Log the email address associated with the token
    if (payload.email) {
      console.log('JWT contains email:', payload.email);
    }
    
    if (payload.gmail_email) {
      console.log('JWT contains gmail_email:', payload.gmail_email);
    }
    
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

async function fetchSubscriptionExamples() {
  try {
    console.log("[DEBUG] Fetching subscription examples from the database");
    
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/subscription_examples?select=*&order=confidence.desc`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });
    
    if (!response.ok) {
      console.error(`[ERROR] Failed to fetch subscription examples: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const examples = await response.json();
    console.log(`[DEBUG] Found ${examples.length} subscription examples in the database`);
    return examples;
  } catch (error) {
    console.error('[ERROR] Error fetching subscription examples:', error.message);
    return [];
  }
}

/**
 * Fetch emails from Gmail
 * @param {string} gmailToken - Gmail API token
 * @returns {Promise<Array>} Array of email message IDs
 */
const fetchEmailsFromGmail = async (gmailToken) => {
  console.log('SCAN-DEBUG: Starting to fetch emails from Gmail');
  
  try {
    // Fetch subscription examples from the database for targeted search
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('SCAN-DEBUG: Fetching subscription examples from database');
    const { data: examples, error } = await supabase
      .from('subscription_examples')
      .select('service_name, sender_pattern, subject_pattern');
    
    if (error) {
      console.error('Error fetching subscription examples:', error.message);
    }
    
    // Build targeted search queries based on subscription examples
    const searchQueries = [];
    const serviceQueries = {};
    
    // Group examples by service name for more targeted queries
    if (examples && examples.length > 0) {
      console.log(`SCAN-DEBUG: Found ${examples.length} subscription examples to use for targeted search`);
      
      // Group by service name
      examples.forEach(example => {
        if (!serviceQueries[example.service_name]) {
          serviceQueries[example.service_name] = [];
        }
        
        if (example.sender_pattern) {
          serviceQueries[example.service_name].push(`from:(${example.sender_pattern})`);
        }
        
        if (example.subject_pattern) {
          serviceQueries[example.service_name].push(`subject:(${example.subject_pattern})`);
        }
      });
      
      // Create queries for each service
      Object.entries(serviceQueries).forEach(([service, patterns]) => {
        if (patterns.length > 0) {
          // Build a combined query for this service
          searchQueries.push(patterns.join(' OR '));
          console.log(`SCAN-DEBUG: Added search query for ${service}`);
        }
      });
    } else {
      console.log('SCAN-DEBUG: No subscription examples found, will use generic queries');
    }
    
    // Add generic subscription-related queries
    const genericQueries = [
      'subject:(subscription OR receipt OR invoice OR payment OR renewal)',
      'subject:(thank you for your purchase OR subscription confirmation OR payment confirmation)',
      'subscription confirmation',
      'payment receipt',
      'recurring payment',
      'monthly subscription',
      'yearly subscription',
      'billing confirmation',
      'trial period',
      'subscription renewal',
      'payment successful',
      'from:(billing) subject:(receipt OR invoice OR payment)',
      'from:(noreply OR no-reply) subject:(subscription OR payment OR receipt OR invoice)',
    ];
    
    // Add queries for common subscription services
    const serviceSpecificQueries = [
      'from:(vercel.com) subject:(receipt OR invoice OR payment OR subscription OR charge OR billing)',
      'from:(babbel.com) subject:(receipt OR invoice OR payment OR subscription OR charge OR billing)',
      'from:(nba.com) subject:(receipt OR invoice OR payment OR subscription OR charge OR billing OR league pass)',
      'from:(ahrefs.com) subject:(receipt OR invoice OR payment OR subscription OR charge OR billing)',
    ];
    
    // Combine all queries
    searchQueries.push(...genericQueries, ...serviceSpecificQueries);
    
    // Remove duplicates
    const uniqueQueries = [...new Set(searchQueries)];
    console.log(`SCAN-DEBUG: Created ${uniqueQueries.length} unique search queries`);
    
    // Execute each query until we get up to 100 unique message IDs
    const uniqueMessageIds = new Set();
    const processedQueryCount = { count: 0 };
    
    // Define a function to execute a single query
    const executeQuery = async (query) => {
      processedQueryCount.count++;
      console.log(`SCAN-DEBUG: Executing query ${processedQueryCount.count}/${uniqueQueries.length}: ${query}`);
      
      const encodedQuery = encodeURIComponent(query);
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodedQuery}&maxResults=20`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${gmailToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`SCAN-DEBUG: Gmail API error: ${response.status} ${errorText}`);
        throw new Error(`Gmail API error: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      const messages = data.messages || [];
      
      console.log(`SCAN-DEBUG: Found ${messages.length} messages for query: ${query}`);
      
      // Add messages to the unique set
      messages.forEach(message => uniqueMessageIds.add(message.id));
      
      return messages.length;
    };
    
    // Execute queries until we have enough messages or run out of queries
    for (const query of uniqueQueries) {
      // Skip if we already have enough messages
      if (uniqueMessageIds.size >= 100) {
        console.log('SCAN-DEBUG: Reached maximum of 100 unique messages, stopping queries');
        break;
      }
      
      await executeQuery(query);
    }
    
    // If we didn't find any messages, try a broader search
    if (uniqueMessageIds.size === 0) {
      console.log('SCAN-DEBUG: No messages found with targeted queries, trying broader search');
      
      const broadQuery = 'category:primary';
      await executeQuery(broadQuery);
    }
    
    // Convert the Set to an Array
    const messageIds = Array.from(uniqueMessageIds);
    
    console.log(`SCAN-DEBUG: Total unique messages found: ${messageIds.length}`);
    console.log(`SCAN-DEBUG: Sample message IDs: ${messageIds.slice(0, 3).join(', ')}${messageIds.length > 3 ? '...' : ''}`);
    
    // Return the unique message IDs
    return messageIds;
  } catch (error) {
    console.error('SCAN-DEBUG: Error fetching emails from Gmail:', error);
    return [];
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
    const { subject, from, date } = parseEmailHeaders(headers);

    // Extract email body
    const body = extractEmailBody(emailContent);

    // Format the complete email
    const formattedEmail = `
From: ${from}
Subject: ${subject}
Date: ${date}

${body}
    `;

    console.log(`Analyzing email "${subject}" with Gemini AI...`);
    
    // Create an enhanced prompt with examples
    const enhancedPrompt = `
You are a specialized AI system designed to analyze emails and identify subscription services with high accuracy.

Your task is to determine if the email contains information about a subscription service, especially:
1. Subscription confirmations
2. Renewal notices
3. Payment receipts for recurring services
4. Subscription-based products or services

Here are examples of known subscriptions:

EXAMPLE 1: NBA League Pass
From: NBA <NBA@nbaemail.nba.com>
Subject: NBA League Pass Subscription Confirmation
Key indicators: "Thank you for your subscription", "NBA League Pass Season-Long", "Automatically Renewed", specific date ranges, recurring billing
Details: EUR 16.99 monthly, renewal dates indicated

EXAMPLE 2: Babbel Language Learning
From: Apple <no_reply@email.apple.com>
Subject: Your subscription confirmation
Key indicators: "Subscription Confirmation", "automatically renews", "3-month plan", Language Learning
Details: € 53,99 per 3 months, renewal date specified

EXAMPLE 3: Vercel Premium
From: Vercel Inc. <invoice+statements@vercel.com>
Subject: Your receipt from Vercel Inc.
Key indicators: Monthly date range (Mar 22 – Apr 21, 2025), Premium plan, recurring payment
Details: $20.00 monthly for Premium plan

EXAMPLE 4: Ahrefs
From: Ahrefs <billing@ahrefs.com>
Subject: Thank you for your payment
Key indicators: "Your Subscription", "Ahrefs Starter - Monthly"
Details: €27.00 monthly, Starter plan

Now analyze the following email content to determine if it relates to a subscription service.
Look for similar patterns as in the examples above.

If this email is about a subscription, extract the following details:
- Service name: The name of the subscription service (be specific)
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

Email Content:
--- START EMAIL CONTENT ---
${formattedEmail}
--- END EMAIL CONTENT ---

JSON Output:
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
            text: enhancedPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.1, // Lower temperature for more precise answers
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
        
        // If a subscription is detected with high confidence, log the details
        if (result.isSubscription && result.confidence > 0.7) {
          console.log(`SCAN-DEBUG: High confidence subscription detected: ${result.serviceName}, ${result.amount} ${result.currency} ${result.billingFrequency}`);
          
          // Store this example for future reference
          await storeSubscriptionExample(from, subject, result);
        }
        
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
    console.log(`SCAN-DEBUG: Adding test subscriptions for user ${dbUserId}`);
    
    // Array of test subscriptions to add
    const testSubscriptions = [
      {
        isSubscription: true,
        serviceName: "[TEST DATA] Netflix",
        amount: 15.99,
        currency: "USD",
        billingFrequency: "monthly",
        nextBillingDate: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString(),
        confidence: 0.95,
        emailSubject: "Your Netflix Subscription",
        emailFrom: "info@netflix.com",
        emailDate: new Date().toISOString(),
        notes: "TEST DATA - This is not a real subscription. Added because no real subscriptions were found."
      },
      {
        isSubscription: true,
        serviceName: "[TEST DATA] Spotify Premium",
        amount: 9.99,
        currency: "USD",
        billingFrequency: "monthly",
        nextBillingDate: new Date(new Date().setDate(new Date().getDate() + 8)).toISOString(),
        confidence: 0.95,
        emailSubject: "Your Spotify Premium Receipt",
        emailFrom: "no-reply@spotify.com",
        emailDate: new Date().toISOString(),
        notes: "TEST DATA - This is not a real subscription. Added because no real subscriptions were found."
      },
      {
        isSubscription: true,
        serviceName: "[TEST DATA] Amazon Prime Membership",
        amount: 119,
        currency: "USD",
        billingFrequency: "yearly",
        nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString(),
        confidence: 0.95,
        emailSubject: "Your Amazon Prime Membership Receipt",
        emailFrom: "auto-confirm@amazon.com",
        emailDate: new Date().toISOString(),
        notes: "TEST DATA - This is not a real subscription. Added because no real subscriptions were found."
      }
    ];
    
    // Add each test subscription
    let addedCount = 0;
    for (const subscription of testSubscriptions) {
      try {
        await saveSubscription(dbUserId, subscription);
        addedCount++;
      } catch (error) {
        console.error(`SCAN-DEBUG: Error adding test subscription ${subscription.serviceName}: ${error.message}`);
      }
    }
    
    console.log(`SCAN-DEBUG: Successfully added ${addedCount} test subscriptions for demonstration`);
    return addedCount > 0;
  } catch (error) {
    console.error(`SCAN-DEBUG: Error adding test subscriptions: ${error.message}`);
    return false;
  }
};

// Function to store subscription examples for future reference
const storeSubscriptionExample = async (sender, subject, analysisResult) => {
  try {
    if (!analysisResult.isSubscription || !analysisResult.serviceName) {
      return; // Don't store non-subscriptions or those without a service name
    }
    
    console.log(`SCAN-DEBUG: Storing subscription example for ${analysisResult.serviceName}`);
    
    // Create examples table if it doesn't exist
    try {
      await fetch(
        `${supabaseUrl}/rest/v1/subscription_examples?select=id&limit=1`, 
        {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );
    } catch (error) {
      console.log(`SCAN-DEBUG: Subscription examples table may not exist, continuing anyway`);
    }
    
    // Store the example in Supabase
    const exampleData = {
      service_name: analysisResult.serviceName,
      sender_pattern: sender,
      subject_pattern: subject,
      amount: analysisResult.amount,
      currency: analysisResult.currency,
      billing_frequency: analysisResult.billingFrequency,
      confidence: analysisResult.confidence,
      created_at: new Date().toISOString()
    };
    
    const response = await fetch(
      `${supabaseUrl}/rest/v1/subscription_examples`, 
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(exampleData)
      }
    );
    
    if (response.ok) {
      console.log(`SCAN-DEBUG: Successfully stored subscription example for ${analysisResult.serviceName}`);
    } else {
      console.error(`SCAN-DEBUG: Failed to store subscription example: ${await response.text()}`);
    }
  } catch (error) {
    console.error(`SCAN-DEBUG: Error storing subscription example: ${error.message}`);
  }
};

// Function to update scan status
const updateScanStatus = async (scanId, dbUserId, updates) => {
  try {
    console.log(`SCAN-DEBUG: Updating scan status for scan ${scanId}: ${JSON.stringify(updates)}`);
    
    // Update the scan record in the database
    const response = await fetch(
      `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, 
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...updates,
          updated_at: new Date().toISOString()
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to update scan status: ${await response.text()}`);
    }
    
    console.log(`SCAN-DEBUG: Successfully updated scan status`);
    return true;
  } catch (error) {
    console.error(`SCAN-DEBUG: Error updating scan status: ${error.message}`);
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
        estimatedTime: '30-60 seconds',
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
        
        let dbUserId = null;
        let pingInterval = null;
        
        try {
          // Set up a ping interval to keep updating the status
          const startTime = Date.now();
          let pingCount = 0;
          
          pingInterval = setInterval(async () => {
            if (!dbUserId) return; // Skip if we don't have a user ID yet
            
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
            clearInterval(pingInterval);
            return;
          }
          
          const users = await userLookupResponse.json();
          
          // Create a new user if not found
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
              clearInterval(pingInterval);
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
            
            // Fetch emails from Gmail
            console.log('SCAN-DEBUG: Fetching emails from Gmail');
            const messages = await fetchEmailsFromGmail(gmailToken);
            
            console.log(`SCAN-DEBUG: Successfully fetched ${messages.length} emails from Gmail`);
            
            // Update scan record with emails found
            await updateScanStatus(scanId, dbUserId, {
              status: 'in_progress',
              progress: 20,
              emails_found: messages.length,
              emails_to_process: messages.length
            });
            
            let processedCount = 0;
            const detectedSubscriptions = [];
            
            console.log(`SCAN-DEBUG: Starting to process ${messages.length} emails`);
            
            // Process emails in smaller batches to avoid taking too long
            for (let i = 0; i < messages.length; i++) {
              const message = messages[i];
              processedCount++;
              
              // Calculate progress percentage (20% to 90% range for email processing)
              const progressPercent = Math.floor(20 + (processedCount / messages.length) * 70);
              
              // Update progress every 5 emails or on the last email
              if (processedCount % 5 === 0 || processedCount === messages.length) {
                await updateScanStatus(scanId, dbUserId, {
                  progress: progressPercent,
                  emails_processed: processedCount,
                  subscriptions_found: detectedSubscriptions.length
                });
              }
              
              console.log(`SCAN-DEBUG: Processing email ${processedCount}/${messages.length} (ID: ${message.id})`);
              
              // Get full message content
              const emailData = await fetchEmailContent(gmailToken, message.id);
              if (!emailData) {
                console.log(`SCAN-DEBUG: Failed to fetch email ${message.id}, skipping`);
                continue;
              }
              
              // Extract headers for logging
              const headers = emailData.payload?.headers || [];
              const { subject, from } = parseEmailHeaders(headers);
              console.log(`SCAN-DEBUG: Analyzing email - From: "${from}", Subject: "${subject}"`);
              
              try {
                // Analyze with Gemini AI
                const analysis = await analyzeEmailWithGemini(emailData);
                
                // Log analysis results
                console.log('SCAN-DEBUG: Analysis result:', JSON.stringify(analysis));
                
                // If this is a subscription with good confidence, save it
                if (analysis.isSubscription && analysis.confidence > 0.6) {
                  console.log(`SCAN-DEBUG: Detected subscription: ${analysis.serviceName || 'Unknown'} (${analysis.confidence.toFixed(2)} confidence)`);
                  detectedSubscriptions.push(analysis);
                  
                  await saveSubscription(dbUserId, analysis);
                } else if (analysis.isSubscription && analysis.confidence > 0.3) {
                  console.log(`SCAN-DEBUG: Possible subscription detected with moderate confidence: ${analysis.serviceName}`);
                }
              } catch (analysisError) {
                console.error(`SCAN-DEBUG: Error analyzing email: ${analysisError.message}`);
              }
            }
            
            console.log(`SCAN-DEBUG: Completed processing all ${processedCount} emails`);
            console.log(`SCAN-DEBUG: Found ${detectedSubscriptions.length} subscriptions`);
            
            // Add test subscriptions if none were found
            if (detectedSubscriptions.length === 0) {
              console.log(`SCAN-DEBUG: No subscriptions found, adding test subscriptions`);
              const testSubAdded = await addTestSubscription(dbUserId);
              
              if (testSubAdded) {
                // Update subscription count in database
                await updateScanStatus(scanId, dbUserId, {
                  subscriptions_found: 3, // 3 test subscriptions
                  is_test_data: true // Flag to indicate these are test subscriptions
                });
              }
            }
            
            // Clear the ping interval
            clearInterval(pingInterval);
            pingInterval = null;
            
            // Update scan record with final status
            await updateScanStatus(scanId, dbUserId, {
              status: 'completed',
              progress: 100,
              emails_processed: processedCount,
              emails_scanned: processedCount,
              subscriptions_found: detectedSubscriptions.length || (testSubAdded ? 3 : 0),
              is_test_data: detectedSubscriptions.length === 0 && testSubAdded, // Flag indicating test data
              completed_at: new Date().toISOString()
            });
            
            console.log(`SCAN-DEBUG: ============== SCANNING PROCESS COMPLETED ==============`);
          } catch (error) {
            console.error(`SCAN-DEBUG: Error processing scan: ${error.message}`);
            
            // Clear ping interval if it's running
            if (pingInterval) {
              clearInterval(pingInterval);
              pingInterval = null;
            }
            
            // Update scan status to error
            if (dbUserId) {
              await updateScanStatus(scanId, dbUserId, {
                status: 'error',
                error_message: error.message,
                completed_at: new Date().toISOString()
              });
            }
          }
        } catch (outerError) {
          console.error(`SCAN-DEBUG: Outer error in scan process: ${outerError.message}`);
          
          // Clear ping interval if it's running
          if (pingInterval) {
            clearInterval(pingInterval);
          }
          
          // Try to update scan status
          if (dbUserId) {
            try {
              await updateScanStatus(scanId, dbUserId, {
                status: 'error',
                error_message: outerError.message,
                completed_at: new Date().toISOString()
              });
            } catch (updateError) {
              console.error(`SCAN-DEBUG: Failed to update error status: ${updateError.message}`);
            }
          }
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