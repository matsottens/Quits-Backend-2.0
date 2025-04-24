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
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodedQuery}&maxResults=50`;
      
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
      if (uniqueMessageIds.size >= 250) {
        console.log('SCAN-DEBUG: Reached maximum of 250 unique messages, stopping queries');
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
    console.log(`SCAN-DEBUG: Total queries executed: ${processedQueryCount.count}/${uniqueQueries.length}`);
    console.log(`SCAN-DEBUG: Processing up to 250 emails to find subscriptions (current: ${messageIds.length})`);
    
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
    console.log(`SCAN-DEBUG: Checking for Gemini API key: ${!!process.env.GEMINI_API_KEY}`);
    console.log(`SCAN-DEBUG: Environment variables available: ${Object.keys(process.env).filter(key => key.includes('GEMINI') || key.includes('API')).join(', ')}`);
    
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not found, using fallback pattern analysis');
      
      // Extract headers for pattern analysis
      const headers = emailContent.payload.headers || [];
      const { subject, from } = parseEmailHeaders(headers);
      
      // Create a simulated subscription detection with high confidence for common services
      const fromLower = from ? from.toLowerCase() : '';
      const subjectLower = subject ? subject.toLowerCase() : '';
      
      // Check for common subscription services in sender or subject
      const commonServices = [
        { pattern: /netflix|nflx/i, name: 'Netflix', amount: 15.99 },
        { pattern: /spotify/i, name: 'Spotify', amount: 9.99 },
        { pattern: /amazon prime|prime video/i, name: 'Amazon Prime', amount: 14.99 },
        { pattern: /disney\+/i, name: 'Disney+', amount: 7.99 },
        { pattern: /hbo|max/i, name: 'HBO Max', amount: 14.99 },
        { pattern: /youtube|yt premium/i, name: 'YouTube Premium', amount: 11.99 },
        { pattern: /apple/i, name: 'Apple', amount: 9.99 },
        { pattern: /hulu/i, name: 'Hulu', amount: 7.99 },
        { pattern: /paramount\+/i, name: 'Paramount+', amount: 9.99 },
        { pattern: /peacock/i, name: 'Peacock', amount: 5.99 },
        { pattern: /adobe/i, name: 'Adobe Creative Cloud', amount: 54.99 },
        { pattern: /microsoft|office 365/i, name: 'Microsoft 365', amount: 6.99 },
        { pattern: /google one|drive storage/i, name: 'Google One', amount: 1.99 },
        { pattern: /dropbox/i, name: 'Dropbox', amount: 11.99 },
        { pattern: /nba|league pass/i, name: 'NBA League Pass', amount: 14.99 },
        { pattern: /babbel/i, name: 'Babbel', amount: 6.95 },
        { pattern: /chegg/i, name: 'Chegg', amount: 14.95 },
        { pattern: /grammarly/i, name: 'Grammarly', amount: 12.00 },
        { pattern: /nordvpn|vpn/i, name: 'NordVPN', amount: 11.95 },
        { pattern: /peloton/i, name: 'Peloton', amount: 44.00 },
        { pattern: /duolingo/i, name: 'Duolingo', amount: 6.99 },
        { pattern: /notion/i, name: 'Notion', amount: 8.00 },
        { pattern: /canva/i, name: 'Canva', amount: 12.99 },
        { pattern: /nytimes|ny times/i, name: 'New York Times', amount: 17.00 }
      ];
      
      for (const service of commonServices) {
        if (service.pattern.test(fromLower) || service.pattern.test(subjectLower)) {
          console.log(`SCAN-DEBUG: Detected ${service.name} subscription using pattern matching`);
          
          // Check for specific pricing in the email body
          const body = extractEmailBody(emailContent);
          const bodyLower = body ? body.toLowerCase() : '';
          
          // Try to extract price using regex
          const priceMatch = bodyLower.match(/\$(\d+\.\d+)|\$(\d+)/);
          const amount = priceMatch ? parseFloat(priceMatch[1] || priceMatch[2]) : service.amount;
          
          // Try to extract frequency
          const frequencyMatch = bodyLower.match(/month|annual|yearly|weekly|quarterly/i);
          let frequency = 'monthly';
          if (frequencyMatch) {
            const match = frequencyMatch[0].toLowerCase();
            if (match.includes('year')) frequency = 'yearly';
            else if (match.includes('week')) frequency = 'weekly';
            else if (match.includes('quarter')) frequency = 'quarterly';
          }
          
          // Generate next billing date based on current date
          const nextBillingDate = new Date();
          if (frequency === 'monthly') nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          else if (frequency === 'yearly') nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
          else if (frequency === 'weekly') nextBillingDate.setDate(nextBillingDate.getDate() + 7);
          else if (frequency === 'quarterly') nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
          
          return {
            isSubscription: true,
            serviceName: service.name,
            amount: amount,
            currency: 'USD',
            billingFrequency: frequency,
            nextBillingDate: nextBillingDate.toISOString().split('T')[0],
            confidence: 0.85
          };
        }
      }
      
      // Check for keywords that indicate subscriptions in the subject
      const subscriptionKeywords = [
        /subscri(be|ption)/i, 
        /renew(al|ed)/i, 
        /bill(ing|ed)/i, 
        /payment/i, 
        /invoice/i, 
        /receipt/i, 
        /charge/i,
        /plan/i,
        /membership/i,
        /monthly/i,
        /yearly/i,
        /trial/i
      ];
      
      let keywordMatch = false;
      for (const keyword of subscriptionKeywords) {
        if (keyword.test(subjectLower)) {
          keywordMatch = true;
          break;
        }
      }
      
      if (keywordMatch) {
        console.log(`SCAN-DEBUG: Detected potential subscription based on keywords in subject: "${subject}"`);
        
        // Extract a service name from the sender domain
        let serviceName = 'Unknown Service';
        if (from) {
          const domainMatch = from.match(/@([^>]+)/) || from.match(/([^<\s]+)$/);
          if (domainMatch) {
            const domain = domainMatch[1].replace(/\.[^.]+$/, ''); // Remove TLD
            serviceName = domain.charAt(0).toUpperCase() + domain.slice(1);
          }
        }
        
        return {
          isSubscription: true,
          serviceName: serviceName,
          amount: 9.99, // Default amount
          currency: 'USD',
          billingFrequency: 'monthly',
          nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
          confidence: 0.6
        };
      }
      
      return {
        isSubscription: false,
        confidence: 0.7
      };
    }
    
    // If we get here, proceed with Gemini API integration
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

// Function to add test subscriptions when none are found
const addTestSubscription = async (dbUserId) => {
  try {
    console.log(`SCAN-DEBUG: Adding test subscriptions for user ${dbUserId}`);
    
    // Sample subscriptions with realistic data
    const sampleSubscriptions = [
      {
        name: "Netflix (DEMO)",
        price: 15.99,
        billing_cycle: "monthly",
        next_billing_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
        category: "entertainment",
        is_manual: false,
        source: "email_scan",
        confidence: 0.92,
        is_test_data: true
      },
      {
        name: "Spotify Premium (DEMO)",
        price: 9.99,
        billing_cycle: "monthly",
        next_billing_date: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().split('T')[0],
        category: "music",
        is_manual: false,
        source: "email_scan",
        confidence: 0.89,
        is_test_data: true
      },
      {
        name: "Amazon Prime (DEMO)",
        price: 14.99,
        billing_cycle: "monthly",
        next_billing_date: new Date(new Date().setDate(new Date().getDate() + 22)).toISOString().split('T')[0],
        category: "shopping",
        is_manual: false,
        source: "email_scan",
        confidence: 0.95,
        is_test_data: true
      },
      {
        name: "Disney+ (DEMO)",
        price: 7.99,
        billing_cycle: "monthly",
        next_billing_date: new Date(new Date().setDate(new Date().getDate() + 18)).toISOString().split('T')[0],
        category: "entertainment",
        is_manual: false,
        source: "email_scan",
        confidence: 0.93,
        is_test_data: true
      },
      {
        name: "Adobe Creative Cloud (DEMO)",
        price: 52.99,
        billing_cycle: "monthly",
        next_billing_date: new Date(new Date().setDate(new Date().getDate() + 27)).toISOString().split('T')[0],
        category: "software",
        is_manual: false,
        source: "email_scan",
        confidence: 0.91,
        is_test_data: true
      }
    ];
    
    let addedCount = 0;
    
    // Add each sample subscription
    for (const subscription of sampleSubscriptions) {
      try {
        // First, check if a similar subscription already exists
        const checkResponse = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${dbUserId}&name=eq.${subscription.name}`, 
          {
            method: 'GET',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (checkResponse.ok) {
          const existing = await checkResponse.json();
          if (existing && existing.length > 0) {
            console.log(`SCAN-DEBUG: ${subscription.name} already exists, skipping`);
            continue; // Skip if already exists
          }
        }
        
        // Create subscription with all required fields
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
              user_id: dbUserId,
              name: subscription.name,
              price: subscription.price,
              billing_cycle: subscription.billing_cycle,
              next_billing_date: subscription.next_billing_date,
              category: subscription.category,
              is_manual: subscription.is_manual,
              source: subscription.source,
              confidence: subscription.confidence,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              notes: "Sample subscription added automatically."
            })
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          console.log(`SCAN-DEBUG: Added test subscription: ${subscription.name} with ID ${data[0]?.id}`);
          addedCount++;
        } else {
          console.error(`SCAN-DEBUG: Failed to add ${subscription.name}: ${await response.text()}`);
        }
      } catch (error) {
        console.error(`SCAN-DEBUG: Error adding ${subscription.name}: ${error.message}`);
      }
    }
    
    console.log(`SCAN-DEBUG: Successfully added ${addedCount} test subscriptions`);
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
    // Make sure we always include the timestamp for when the update occurred
    const timestamp = new Date().toISOString();
    
    // Always include progress in statistics
    const fullUpdates = {
      ...updates,
      updated_at: timestamp,
      timestamps: {
        ...(updates.timestamps || {}),
        last_update: timestamp
      }
    };

    // Ensure we have emails_found, emails_to_process, and emails_processed for progress tracking
    if (!fullUpdates.emails_found || !fullUpdates.emails_to_process || fullUpdates.emails_processed === undefined) {
      console.log(`SCAN-DEBUG: Adding or updating email stats for progress calculation`);
      
      // Get current scan status to ensure we have up-to-date stats
      const currentScanResponse = await fetch(
        `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}&select=*`, 
        {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (currentScanResponse.ok) {
        const currentScan = await currentScanResponse.json();
        if (currentScan && currentScan.length > 0) {
          // Keep existing values if we have them
          if (!fullUpdates.emails_found) {
            fullUpdates.emails_found = currentScan[0].emails_found || 250;
          }
          
          if (!fullUpdates.emails_to_process) {
            fullUpdates.emails_to_process = currentScan[0].emails_to_process || 250;
          }
          
          if (fullUpdates.emails_processed === undefined) {
            // If we're updating progress but not emails_processed, calculate it
            if (updates.progress !== undefined) {
              const progressPercent = updates.progress / 100;
              fullUpdates.emails_processed = Math.floor(fullUpdates.emails_to_process * progressPercent);
            } else {
              fullUpdates.emails_processed = currentScan[0].emails_processed || 0;
            }
          }
          
          // Always include subscriptions_found
          if (fullUpdates.subscriptions_found === undefined) {
            fullUpdates.subscriptions_found = currentScan[0].subscriptions_found || 0;
          }
        } else {
          // No current scan found, set defaults
          if (!fullUpdates.emails_found) fullUpdates.emails_found = 250;
          if (!fullUpdates.emails_to_process) fullUpdates.emails_to_process = 250;
          if (fullUpdates.emails_processed === undefined) {
            fullUpdates.emails_processed = updates.progress ? Math.floor((updates.progress / 100) * 250) : 0;
          }
          if (fullUpdates.subscriptions_found === undefined) fullUpdates.subscriptions_found = 0;
        }
      } else {
        // Fallback defaults if we can't get current scan
        if (!fullUpdates.emails_found) fullUpdates.emails_found = 250;
        if (!fullUpdates.emails_to_process) fullUpdates.emails_to_process = 250;
        if (fullUpdates.emails_processed === undefined) {
          fullUpdates.emails_processed = updates.progress ? Math.floor((updates.progress / 100) * 250) : 0;
        }
        if (fullUpdates.subscriptions_found === undefined) fullUpdates.subscriptions_found = 0;
      }
    }
    
    // If we have emails_processed and emails_to_process but no progress update,
    // calculate the progress based on the email processing
    if (fullUpdates.emails_processed !== undefined && 
        fullUpdates.emails_to_process && 
        updates.progress === undefined) {
      
      // Calculate progress based on email processing (scale to 20-90% range)
      const processingProgress = fullUpdates.emails_processed / fullUpdates.emails_to_process;
      fullUpdates.progress = Math.min(90, Math.max(20, Math.floor(20 + (processingProgress * 70))));
      
      console.log(`SCAN-DEBUG: Calculated progress ${fullUpdates.progress}% based on email processing (${fullUpdates.emails_processed}/${fullUpdates.emails_to_process})`);
    }
    
    console.log(`SCAN-DEBUG: Updating scan status for scan ${scanId}: ${JSON.stringify(fullUpdates)}`);
    
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
        body: JSON.stringify(fullUpdates)
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
              // Don't update progress artificially - only update timestamp to show the scan is still alive
              // Get current scan status to ensure consistent reporting
              const currentScanResponse = await fetch(
                `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}&select=*`, 
                {
                  method: 'GET',
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              
              if (currentScanResponse.ok) {
                const scanData = await currentScanResponse.json();
                if (scanData && scanData.length > 0) {
                  // Only update the timestamp, preserve existing progress and stats
                  await updateScanStatus(scanId, dbUserId, {
                    // Keep existing progress
                    progress: scanData[0].progress,
                    // Keep existing stats
                    emails_found: scanData[0].emails_found || 0,
                    emails_to_process: scanData[0].emails_to_process || 0,
                    emails_processed: scanData[0].emails_processed || 0,
                    subscriptions_found: scanData[0].subscriptions_found || 0
                  });
                  console.log(`SCAN-DEBUG: Updated scan status ping with current progress ${scanData[0].progress}%`);
                }
              }
            } catch (pingError) {
              console.error(`SCAN-DEBUG: Error updating ping: ${pingError.message}`);
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
            console.log(`SCAN-DEBUG: ===== Email Scan Statistics =====`);
            console.log(`SCAN-DEBUG: Total emails found: ${messages.length}`);
            console.log(`SCAN-DEBUG: Starting batch processing...`);
            
            // Update scan record with emails found
            await updateScanStatus(scanId, dbUserId, {
              status: 'in_progress',
              progress: 20,
              emails_found: messages.length,
              emails_to_process: messages.length,
              scan_stats: {
                total_emails: messages.length,
                start_time: new Date().toISOString()
              }
            });
            
            let processedCount = 0;
            let skippedCount = 0;
            const detectedSubscriptions = [];
            const analysisResults = [];
            
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
                  subscriptions_found: detectedSubscriptions.length,
                  scan_stats: {
                    processed_count: processedCount,
                    skipped_count: skippedCount,
                    detected_subscriptions: detectedSubscriptions.length,
                    last_update: new Date().toISOString()
                  }
                });
              }
              
              console.log(`SCAN-DEBUG: Processing email ${processedCount}/${messages.length} (ID: ${message.id})`);
              
              // Get full message content
              const emailData = await fetchEmailContent(gmailToken, message.id);
              if (!emailData) {
                console.log(`SCAN-DEBUG: Failed to fetch email ${message.id}, skipping`);
                skippedCount++;
                continue;
              }
              
              // Extract headers for logging
              const headers = emailData.payload?.headers || [];
              const { subject, from } = parseEmailHeaders(headers);
              console.log(`SCAN-DEBUG: Analyzing email - From: "${from}", Subject: "${subject}"`);
              
              try {
                // Analyze with Gemini AI
                const analysis = await analyzeEmailWithGemini(emailData);
                
                // Store analysis results
                analysisResults.push({
                  from,
                  subject,
                  analysis,
                  timestamp: new Date().toISOString()
                });
                
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
                skippedCount++;
              }
            }
            
            // Final statistics
            const endTime = new Date().toISOString();
            const scanStats = {
              total_emails: messages.length,
              processed_count: processedCount,
              skipped_count: skippedCount,
              detected_subscriptions: detectedSubscriptions.length,
              start_time: analysisResults[0]?.timestamp,
              end_time: endTime,
              analysis_results: analysisResults
            };
            
            console.log(`SCAN-DEBUG: ===== Final Scan Statistics =====`);
            console.log(`SCAN-DEBUG: Total emails processed: ${processedCount}/${messages.length}`);
            console.log(`SCAN-DEBUG: Skipped emails: ${skippedCount}`);
            console.log(`SCAN-DEBUG: Found ${detectedSubscriptions.length} subscriptions`);
            console.log(`SCAN-DEBUG: Scan efficiency: ${(detectedSubscriptions.length/processedCount*100).toFixed(2)}% hit rate`);
            
            // Clear the ping interval
            clearInterval(pingInterval);
            pingInterval = null;
            
            // Set isTestData to false - we never want to add test data
            const isTestData = false;
            
            // Update scan record with final status
            await updateScanStatus(scanId, dbUserId, {
              status: 'completed',
              progress: 100,
              emails_processed: processedCount,
              emails_scanned: processedCount,
              subscriptions_found: detectedSubscriptions.length,
              is_test_data: isTestData,
              completed_at: endTime,
              scan_stats: scanStats
            });
            
            console.log(`SCAN-DEBUG: ============== SCANNING PROCESS COMPLETED ==============`);
            console.log(`SCAN-DEBUG: is_test_data: ${isTestData}`);
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