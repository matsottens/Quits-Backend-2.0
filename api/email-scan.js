// Email scan endpoint
import jsonwebtoken from 'jsonwebtoken';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { extractEmailBody, analyzeEmailForSubscriptions, parseEmailHeaders } from './email-utils.js';
import { google } from 'googleapis';
const { verify } = jsonwebtoken;

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Add logging to help debug
console.log(`Email-scan: Supabase URL defined: ${!!supabaseUrl}`);
console.log(`Email-scan: Supabase key defined: ${!!supabaseKey}`);
console.log(`Email-scan: Using SUPABASE_SERVICE_ROLE_KEY: ${!!supabaseServiceRoleKey}`);
console.log(`Email-scan: Using SUPABASE_SERVICE_KEY: ${!!supabaseServiceKey}`);

// Helper function to extract Gmail token from JWT
const extractGmailToken = (token) => {
  try {
    const payload = jsonwebtoken.decode(token);
    console.log('SCAN-DEBUG: JWT payload keys:', Object.keys(payload));
    
    // Log the email address associated with the token
    if (payload.email) {
      console.log('SCAN-DEBUG: JWT contains email:', payload.email);
    }
    
    if (payload.gmail_email) {
      console.log('SCAN-DEBUG: JWT contains gmail_email:', payload.gmail_email);
    }
    
    // Check for Gmail token in various possible fields
    if (payload.gmail_token) {
      console.log('SCAN-DEBUG: Found gmail_token in JWT');
      return payload.gmail_token;
    }
    
    if (payload.access_token) {
      console.log('SCAN-DEBUG: Found access_token in JWT, using as Gmail token');
      return payload.access_token;
    }
    
    if (payload.google_token) {
      console.log('SCAN-DEBUG: Found google_token in JWT');
      return payload.google_token;
    }
    
    if (payload.oauth_token) {
      console.log('SCAN-DEBUG: Found oauth_token in JWT');
      return payload.oauth_token;
    }
    
    console.error('SCAN-DEBUG: No Gmail token found in JWT, payload keys:', Object.keys(payload));
    console.error('SCAN-DEBUG: JWT payload (sanitized):', {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      iat: payload.iat,
      exp: payload.exp,
      has_gmail_token: !!payload.gmail_token,
      has_access_token: !!payload.access_token,
      has_google_token: !!payload.google_token,
      has_oauth_token: !!payload.oauth_token
    });
    return null;
  } catch (error) {
    console.error('SCAN-DEBUG: Error extracting Gmail token:', error);
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
  console.log('SCAN-DEBUG: Gmail token length:', gmailToken?.length || 0);
  
  try {
    // First validate the token
    console.log('SCAN-DEBUG: About to validate Gmail token');
    const isValidToken = await validateGmailToken(gmailToken);
    if (!isValidToken) {
      console.error('SCAN-DEBUG: Gmail token validation failed');
      return [];
    }
    console.log('SCAN-DEBUG: Gmail token validated successfully');
    
    // Fetch subscription examples from the database for targeted search
    console.log('SCAN-DEBUG: About to fetch subscription examples from database');
    
    console.log('SCAN-DEBUG: Fetching subscription examples from database');
    const { data: examples, error } = await supabase
      .from('subscription_examples')
      .select('service_name, sender_pattern, subject_pattern');
    
    if (error) {
      console.error('SCAN-DEBUG: Error fetching subscription examples:', error.message);
    } else {
      console.log(`SCAN-DEBUG: Found ${examples?.length || 0} subscription examples`);
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
      
      console.log(`SCAN-DEBUG: Making Gmail API request to: ${url}`);
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${gmailToken}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log(`SCAN-DEBUG: Gmail API response status: ${response.status}`);
        
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
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.error(`SCAN-DEBUG: Gmail API request timed out for query: ${query}`);
          throw new Error(`Gmail API request timed out for query: ${query}`);
        }
        throw error;
      }
    };
    
    console.log('SCAN-DEBUG: Starting to execute queries');
    // Execute queries until we have enough messages or run out of queries
    for (const query of uniqueQueries) {
      // Skip if we already have enough messages
      if (uniqueMessageIds.size >= 250) {
        console.log('SCAN-DEBUG: Reached maximum of 250 unique messages, stopping queries');
        break;
      }
      
      try {
        await executeQuery(query);
      } catch (error) {
        console.error(`SCAN-DEBUG: Error executing query "${query}":`, error.message);
        // Continue with next query instead of failing completely
        continue;
      }
    }
    
    // If we didn't find any messages, try a broader search
    if (uniqueMessageIds.size === 0) {
      console.log('SCAN-DEBUG: No messages found with targeted queries, trying broader search');
      
      const broadQuery = 'category:primary';
      try {
        await executeQuery(broadQuery);
      } catch (error) {
        console.error(`SCAN-DEBUG: Error executing broad query:`, error.message);
      }
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
    console.error('SCAN-DEBUG: Error stack:', error.stack);
    return [];
  }
};

// Function to fetch detailed email content
const fetchEmailContent = async (gmailToken, messageId) => {
  console.log(`SCAN-DEBUG: Fetching content for email ID: ${messageId}`);
  if (!gmailToken) {
    console.error(`SCAN-DEBUG: No Gmail token provided to fetchEmailContent for messageId: ${messageId}`);
    return null;
  }
  if (!messageId) {
    console.error('SCAN-DEBUG: No messageId provided to fetchEmailContent');
    return null;
  }
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

// Function to analyze email with enhanced pattern matching (NO Gemini API calls)
const analyzeEmailWithPatternMatching = async (emailContent) => {
  console.log('SCAN-DEBUG: Analyzing email with enhanced pattern matching');
  if (!emailContent) {
    console.error('SCAN-DEBUG: No emailContent provided to analyzeEmailWithPatternMatching');
    return { isSubscription: false, confidence: 0 };
  }
  
  try {
    // Format email data for analysis
    const headers = emailContent.payload.headers || [];
    const { subject, from, date } = parseEmailHeaders(headers);
    const body = extractEmailBody(emailContent);

    console.log(`SCAN-DEBUG: Enhanced fallback analysis - Subject: "${subject}", From: "${from}"`);

    // Enhanced pattern matching for subscription detection
    const emailText = `${subject} ${from} ${body}`.toLowerCase();
    
    // Check for subscription indicators
    const subscriptionKeywords = [
      'subscription', 'renewal', 'billing', 'payment', 'receipt', 'invoice',
      'monthly', 'yearly', 'annual', 'weekly', 'quarterly', 'recurring',
      'auto-renew', 'auto renew', 'renew automatically', 'next billing',
      'subscription confirmation', 'payment confirmation', 'billing confirmation',
      'thank you for your purchase', 'your subscription', 'membership'
    ];

    const hasSubscriptionKeywords = subscriptionKeywords.some(keyword => 
      emailText.includes(keyword)
    );

    if (!hasSubscriptionKeywords) {
      console.log('SCAN-DEBUG: No subscription keywords found');
      return { isSubscription: false, confidence: 0.1 };
    }

    // Enhanced service name extraction
    let serviceName = null;
    let amount = 0;
    let currency = 'USD';
    let billingFrequency = 'monthly';
    let confidence = 0.6;

    // Extract service name from common patterns
    if (emailText.includes('microsoft') || emailText.includes('office 365') || emailText.includes('365')) {
      serviceName = 'Microsoft 365';
      console.log('SCAN-DEBUG: Enhanced detection - Found Microsoft 365 subscription');
    } else if (emailText.includes('nba') || emailText.includes('league pass')) {
      serviceName = 'NBA League Pass';
      console.log('SCAN-DEBUG: Enhanced detection - Found NBA League Pass subscription');
    } else if (emailText.includes('netflix')) {
      serviceName = 'Netflix';
      console.log('SCAN-DEBUG: Enhanced detection - Found Netflix subscription');
    } else if (emailText.includes('spotify')) {
      serviceName = 'Spotify';
      console.log('SCAN-DEBUG: Enhanced detection - Found Spotify subscription');
    } else if (emailText.includes('amazon') || emailText.includes('prime')) {
      serviceName = 'Amazon Prime';
      console.log('SCAN-DEBUG: Enhanced detection - Found Amazon Prime subscription');
    } else if (emailText.includes('disney') || emailText.includes('disney+')) {
      serviceName = 'Disney+';
      console.log('SCAN-DEBUG: Enhanced detection - Found Disney+ subscription');
    } else if (emailText.includes('hbo') || emailText.includes('max')) {
      serviceName = 'HBO Max';
      console.log('SCAN-DEBUG: Enhanced detection - Found HBO Max subscription');
    } else if (emailText.includes('youtube') || emailText.includes('yt premium')) {
      serviceName = 'YouTube Premium';
      console.log('SCAN-DEBUG: Enhanced detection - Found YouTube Premium subscription');
    } else if (emailText.includes('apple')) {
      serviceName = 'Apple Services';
      console.log('SCAN-DEBUG: Enhanced detection - Found Apple Services subscription');
    } else if (emailText.includes('hulu')) {
      serviceName = 'Hulu';
      console.log('SCAN-DEBUG: Enhanced detection - Found Hulu subscription');
    } else if (emailText.includes('paramount') || emailText.includes('paramount+')) {
      serviceName = 'Paramount+';
      console.log('SCAN-DEBUG: Enhanced detection - Found Paramount+ subscription');
    } else if (emailText.includes('peacock')) {
      serviceName = 'Peacock';
      console.log('SCAN-DEBUG: Enhanced detection - Found Peacock subscription');
    } else if (emailText.includes('adobe')) {
      serviceName = 'Adobe Creative Cloud';
      console.log('SCAN-DEBUG: Enhanced detection - Found Adobe Creative Cloud subscription');
    } else if (emailText.includes('google one') || emailText.includes('drive storage')) {
      serviceName = 'Google One';
      console.log('SCAN-DEBUG: Enhanced detection - Found Google One subscription');
    } else if (emailText.includes('dropbox')) {
      serviceName = 'Dropbox';
      console.log('SCAN-DEBUG: Enhanced detection - Found Dropbox subscription');
    } else if (emailText.includes('babbel')) {
      serviceName = 'Babbel';
      console.log('SCAN-DEBUG: Enhanced detection - Found Babbel subscription');
    } else if (emailText.includes('chegg')) {
      serviceName = 'Chegg';
      console.log('SCAN-DEBUG: Enhanced detection - Found Chegg subscription');
    } else if (emailText.includes('grammarly')) {
      serviceName = 'Grammarly';
      console.log('SCAN-DEBUG: Enhanced detection - Found Grammarly subscription');
    } else if (emailText.includes('nordvpn') || emailText.includes('vpn')) {
      serviceName = 'NordVPN';
      console.log('SCAN-DEBUG: Enhanced detection - Found NordVPN subscription');
    } else if (emailText.includes('peloton')) {
      serviceName = 'Peloton';
      console.log('SCAN-DEBUG: Enhanced detection - Found Peloton subscription');
    } else if (emailText.includes('duolingo')) {
      serviceName = 'Duolingo';
      console.log('SCAN-DEBUG: Enhanced detection - Found Duolingo subscription');
    } else if (emailText.includes('notion')) {
      serviceName = 'Notion';
      console.log('SCAN-DEBUG: Enhanced detection - Found Notion subscription');
    } else if (emailText.includes('canva')) {
      serviceName = 'Canva';
      console.log('SCAN-DEBUG: Enhanced detection - Found Canva subscription');
    } else if (emailText.includes('nytimes') || emailText.includes('ny times')) {
      serviceName = 'New York Times';
      console.log('SCAN-DEBUG: Enhanced detection - Found New York Times subscription');
    } else if (emailText.includes('vercel')) {
      serviceName = 'Vercel';
      console.log('SCAN-DEBUG: Enhanced detection - Found Vercel subscription');
    } else {
      // Try to extract service name from sender domain
      const domainMatch = from.match(/@([^.]+)\./);
      if (domainMatch) {
        const domain = domainMatch[1];
        serviceName = domain.charAt(0).toUpperCase() + domain.slice(1);
        console.log(`SCAN-DEBUG: Enhanced detection - Extracted service name from domain: ${serviceName}`);
      } else {
        serviceName = 'Unknown Service';
        console.log('SCAN-DEBUG: Enhanced detection - Using generic service name');
      }
    }

    // Extract price and currency
    const pricePatterns = [
      /\$(\d+\.?\d*)/g,           // $19.99
      /€(\d+\.?\d*)/g,            // €19.99
      /£(\d+\.?\d*)/g,            // £19.99
      /(\d+\.?\d*)\s*(?:usd|dollars?)/gi,  // 19.99 USD
      /(\d+\.?\d*)\s*(?:eur|euros?)/gi,    // 19.99 EUR
      /(\d+\.?\d*)\s*(?:gbp|pounds?)/gi,   // 19.99 GBP
    ];

    for (const pattern of pricePatterns) {
      const matches = emailText.match(pattern);
      if (matches) {
        const price = parseFloat(matches[0].replace(/[^\d.]/g, ''));
        if (price > 0) {
          amount = price;
          if (pattern.source.includes('€')) currency = 'EUR';
          else if (pattern.source.includes('£')) currency = 'GBP';
          else currency = 'USD';
          console.log(`SCAN-DEBUG: Enhanced detection - Extracted: ${amount} ${currency}`);
          break;
        }
      }
    }

    // Extract billing frequency
    if (emailText.includes('monthly') || emailText.includes('per month')) {
      billingFrequency = 'monthly';
    } else if (emailText.includes('yearly') || emailText.includes('annual') || emailText.includes('per year')) {
      billingFrequency = 'yearly';
    } else if (emailText.includes('weekly') || emailText.includes('per week')) {
      billingFrequency = 'weekly';
    } else if (emailText.includes('quarterly') || emailText.includes('per quarter')) {
      billingFrequency = 'quarterly';
    }

    // Calculate confidence based on how much information we found
    if (serviceName && serviceName !== 'Unknown Service') confidence += 0.2;
    if (amount > 0) confidence += 0.2;
    if (billingFrequency !== 'monthly') confidence += 0.1;

    console.log(`SCAN-DEBUG: Pattern matching result: ${serviceName} (${confidence} confidence)`);

    return {
      isSubscription: true,
      serviceName: serviceName,
      amount: amount,
      currency: currency,
      billingFrequency: billingFrequency,
      nextBillingDate: null, // Will be extracted by Gemini
      confidence: Math.min(confidence, 0.9) // Cap at 0.9 for pattern matching
    };

  } catch (error) {
    console.error('SCAN-DEBUG: Error in pattern matching analysis:', error);
    return { isSubscription: false, confidence: 0 };
  }
};

// Function to normalize service names for better duplicate detection
const normalizeServiceName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // Remove non-alphanumeric characters
    .replace(/\b(inc|llc|ltd|corp|co|company|limited|incorporated)\b/g, '') // Remove company suffixes
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
};

// Function to save detected subscription to database
const saveSubscription = async (userId, subscriptionData) => {
  console.log('SCAN-DEBUG: Attempting to save subscription:', JSON.stringify(subscriptionData));
  if (!userId) {
    console.error('SCAN-DEBUG: No userId provided to saveSubscription');
    return null;
  }
  if (!subscriptionData || !subscriptionData.serviceName) {
    console.error('SCAN-DEBUG: Invalid subscriptionData provided to saveSubscription:', subscriptionData);
    return null;
  }
  try {
    // Normalize the service name for better duplicate detection
    const normalizedName = normalizeServiceName(subscriptionData.serviceName);
    console.log(`SCAN-DEBUG: Normalized service name: "${subscriptionData.serviceName}" -> "${normalizedName}"`);
    
    // First check if a similar subscription already exists using normalized name
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&name=ilike.${encodeURIComponent('%' + normalizedName + '%')}`, 
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
        console.log(`SCAN-DEBUG: Subscription for "${subscriptionData.serviceName}" (normalized: "${normalizedName}") already exists, skipping`);
        console.log(`SCAN-DEBUG: Existing subscriptions found:`, existingSubscriptions.map(s => s.name));
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
const validateGmailToken = async (token) => {
  console.log('SCAN-DEBUG: Validating Gmail token');
  if (!token) {
    console.error('SCAN-DEBUG: No Gmail token provided');
      return false;
    }

  try {
    // Create OAuth2 client and set credentials
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    
    // Initialize Gmail API with the OAuth2 client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    console.log('SCAN-DEBUG: Making test call to Gmail API');
    const response = await gmail.users.getProfile({ userId: 'me' });
    console.log('SCAN-DEBUG: Gmail API response:', response.status);
    return true;
  } catch (error) {
    console.error('SCAN-DEBUG: Gmail token validation failed:', error.message);
    if (error.response) {
      console.error('SCAN-DEBUG: Gmail API error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
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

// Function to create a scan record
const createScanRecord = async (userId, decoded) => {
  console.log('SCAN-DEBUG: Creating scan record for user:', userId);
  
  try {
    // First, look up the database user ID using google_id or email
    console.log('SCAN-DEBUG: Looking up database user ID for Google user ID:', userId);
    
    const userEmail = decoded.email;
    
    const userLookupResponse = await fetch(
      `${supabaseUrl}/rest/v1/users?select=id,email,google_id&or=(email.eq.${encodeURIComponent(userEmail)},google_id.eq.${encodeURIComponent(userId)})`, 
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
      console.error('SCAN-DEBUG: User lookup failed:', errorText);
      throw new Error(`User lookup failed: ${errorText}`);
    }
    
    const users = await userLookupResponse.json();
    
    // Create a new user if not found
    let dbUserId;
    if (!users || users.length === 0) {
      console.log(`SCAN-DEBUG: User not found in database, creating new user for: ${userEmail}`);
      
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
            email: userEmail,
            google_id: userId,
            name: decoded.name || userEmail.split('@')[0],
            avatar_url: decoded.picture || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        }
      );
      
      if (!createUserResponse.ok) {
        const errorText = await createUserResponse.text();
        console.error('SCAN-DEBUG: Failed to create user:', errorText);
        throw new Error(`Failed to create user: ${errorText}`);
      }
      
      const newUser = await createUserResponse.json();
      dbUserId = newUser[0].id;
      console.log(`SCAN-DEBUG: Created new user with ID: ${dbUserId}`);
    } else {
      dbUserId = users[0].id;
      console.log(`SCAN-DEBUG: Found existing user with ID: ${dbUserId}`);
    }
    
    const scanId = 'scan_' + Math.random().toString(36).substring(2, 15);
    const timestamp = new Date().toISOString();
    
    const scanRecord = {
      scan_id: scanId,
      user_id: dbUserId, // Use the database user ID (UUID)
      status: 'pending',
      progress: 0,
      emails_found: 0,
      emails_to_process: 0,
      emails_processed: 0,
      subscriptions_found: 0,
      created_at: timestamp,
      updated_at: timestamp
    };
    
    console.log('SCAN-DEBUG: Creating scan record with data:', JSON.stringify(scanRecord, null, 2));
    
    const response = await fetch(`${supabaseUrl}/rest/v1/scan_history`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(scanRecord)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('SCAN-DEBUG: Failed to create scan record:', errorText);
      throw new Error(`Failed to create scan record: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('SCAN-DEBUG: Successfully created scan record:', result);
    
    return { scanId, dbUserId };
  } catch (error) {
    console.error('SCAN-DEBUG: Error creating scan record:', error);
    throw error;
  }
};

// Function to update scan status
const updateScanStatus = async (scanId, dbUserId, updates) => {
  console.log('SCAN-DEBUG: Updating scan status with:', JSON.stringify(updates, null, 2));
  
  try {
    const timestamp = new Date().toISOString();
    
    // Only include fields that exist in the scan_history table
    const allowedFields = [
      'status', 'progress', 'emails_found', 'emails_to_process', 
      'emails_processed', 'subscriptions_found', 'completed_at', 'updated_at'
    ];
    
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      } else {
        console.log(`SCAN-DEBUG: Skipping field '${key}' as it may not exist in scan_history table`);
      }
    });
    
    // Always include updated_at timestamp
    filteredUpdates.updated_at = timestamp;

    // Only fetch current scan status if email stats are completely missing (undefined/null)
    // Don't override explicit 0 values
    if (filteredUpdates.emails_found === undefined || filteredUpdates.emails_found === null ||
        filteredUpdates.emails_to_process === undefined || filteredUpdates.emails_to_process === null ||
        filteredUpdates.emails_processed === undefined || filteredUpdates.emails_processed === null) {
      console.log('SCAN-DEBUG: Some email stats missing, fetching current scan status');
      const currentScan = await fetch(`${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (currentScan.ok) {
        const currentData = await currentScan.json();
        if (currentData && currentData.length > 0) {
          const current = currentData[0];
          // Only use defaults if the values are undefined/null, not if they're explicitly 0
          if (filteredUpdates.emails_found === undefined || filteredUpdates.emails_found === null) {
            filteredUpdates.emails_found = current.emails_found || 0;
          }
          if (filteredUpdates.emails_to_process === undefined || filteredUpdates.emails_to_process === null) {
            filteredUpdates.emails_to_process = current.emails_to_process || 0;
          }
          if (filteredUpdates.emails_processed === undefined || filteredUpdates.emails_processed === null) {
            filteredUpdates.emails_processed = current.emails_processed || 0;
          }
        }
      }
    }

    console.log('SCAN-DEBUG: Final update data:', JSON.stringify(filteredUpdates, null, 2));

    const response = await fetch(`${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(filteredUpdates)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SCAN-DEBUG: Failed to update scan status:', errorText);
      throw new Error(`Failed to update scan status: ${errorText}`);
    }

    console.log('SCAN-DEBUG: Successfully updated scan status');
  } catch (error) {
    console.error('SCAN-DEBUG: Error updating scan status:', error);
    throw error;
  }
};

const searchEmails = async (gmail, query) => {
  console.log('SCAN-DEBUG: Searching emails with query:', query);
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 250
    });
    
    const messages = response.data.messages || [];
    console.log('SCAN-DEBUG: Found', messages.length, 'emails matching query');
    
    if (messages.length === 0) {
      console.log('SCAN-DEBUG: No emails found with query, trying broader search');
      const broadResponse = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 250
      });
      const broadMessages = broadResponse.data.messages || [];
      console.log('SCAN-DEBUG: Found', broadMessages.length, 'emails in broad search');
      return broadMessages;
    }
    
    return messages;
  } catch (error) {
    console.error('SCAN-DEBUG: Error searching emails:', error.message);
    if (error.response) {
      console.error('SCAN-DEBUG: Gmail API error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    return [];
  }
};

const processEmails = async (gmailToken, scanId, userId) => {
  console.log('SCAN-DEBUG: ===== PROCESS EMAILS FUNCTION CALLED =====');
  console.log('SCAN-DEBUG: Starting processEmails');
  console.log('SCAN-DEBUG: Gmail token provided:', !!gmailToken);
  console.log('SCAN-DEBUG: Scan ID provided:', scanId);
  console.log('SCAN-DEBUG: User ID provided:', userId);
  
  if (!gmailToken) {
    console.error('SCAN-DEBUG: No Gmail token provided to processEmails');
    return;
  }
  if (!scanId) {
    console.error('SCAN-DEBUG: No scanId provided to processEmails');
    return;
  }
  if (!userId) {
    console.error('SCAN-DEBUG: No userId provided to processEmails');
    return;
  }
            
  try {
    // Step-based progress values
    const PROGRESS = {
      start: 5,
      token_validated: 10,
      fetched_examples: 15,
      searched_gmail: 20,
      emails_fetched: 25,
      processing_emails_start: 30,
      processing_emails_end: 80, // Will interpolate between start and end
      ready_for_analysis: 90,
      completed: 100
    };

    // 1. Start
    await updateScanStatus(scanId, userId, {
      status: 'in_progress',
      progress: PROGRESS.start
    });

    // 2. Token validated
    // (Assume token is already validated before calling processEmails)
    await updateScanStatus(scanId, userId, {
      progress: PROGRESS.token_validated
    });

    // 3. Fetch subscription examples
    let examples = [];
    try {
      const { data, error } = await supabase
        .from('subscription_examples')
        .select('service_name, sender_pattern, subject_pattern');
      if (!error && data) examples = data;
    } catch {}
    await updateScanStatus(scanId, userId, {
      progress: PROGRESS.fetched_examples
    });

    // 4. Search Gmail for emails
    // (fetchEmailsFromGmail will do the searching)
    await updateScanStatus(scanId, userId, {
      progress: PROGRESS.searched_gmail
    });
    const emails = await fetchEmailsFromGmail(gmailToken);
    await updateScanStatus(scanId, userId, {
      progress: PROGRESS.emails_fetched,
      emails_found: emails.length,
      emails_to_process: emails.length,
      emails_processed: 0
    });

    // 5. Processing emails (granular progress)
    const totalEmails = emails.length;
    if (totalEmails === 0) {
      await updateScanStatus(scanId, userId, {
        status: 'ready_for_analysis',
        progress: PROGRESS.ready_for_analysis,
        emails_found: 0,
        emails_processed: 0,
        subscriptions_found: 0,
        completed_at: new Date().toISOString()
      });
      return;
    }
    await updateScanStatus(scanId, userId, {
      progress: PROGRESS.processing_emails_start
    });
    let processedCount = 0;
    let subscriptionsFound = 0;
    const processedMessageIds = new Set();
    
    // Initialize existingSubscriptionIds with current user subscriptions to prevent duplicates
    const existingSubscriptionIds = new Set();
    try {
      const { data: existingSubscriptions, error: fetchError } = await supabase
        .from('subscriptions')
        .select('name')
        .eq('user_id', userId);
      
      if (!fetchError && existingSubscriptions) {
        existingSubscriptions.forEach(sub => {
          const normalizedName = normalizeServiceName(sub.name);
          existingSubscriptionIds.add(normalizedName);
          console.log(`SCAN-DEBUG: Added existing subscription to duplicate check: "${sub.name}" (normalized: "${normalizedName}")`);
        });
        console.log(`SCAN-DEBUG: Loaded ${existingSubscriptions.length} existing subscriptions for duplicate prevention`);
      } else if (fetchError) {
        console.error('SCAN-DEBUG: Error fetching existing subscriptions:', fetchError);
      }
    } catch (error) {
      console.error('SCAN-DEBUG: Error initializing existing subscriptions:', error);
    }

    for (let i = 0; i < totalEmails; i++) {
      try {
        console.log(`SCAN-DEBUG: Processing email ${i + 1}/${emails.length}`);
        const message = emails[i];
        const messageId = message.id || message;
        
        // Skip if we've already processed this message
        if (processedMessageIds.has(messageId)) {
          console.log(`SCAN-DEBUG: Skipping duplicate message ${messageId}`);
          continue;
        }
        
        // Mark this message as processed
        processedMessageIds.add(messageId);
        
        // Interpolate progress between processing_emails_start and processing_emails_end
        const emailProgress = PROGRESS.processing_emails_start + ((processedCount / totalEmails) * (PROGRESS.processing_emails_end - PROGRESS.processing_emails_start));
        await updateScanStatus(scanId, userId, {
          progress: Math.round(emailProgress),
          emails_processed: processedCount
        });
        
        // Fetch email content
        console.log(`SCAN-DEBUG: Fetching content for email ${messageId}`);
        const emailData = await fetchEmailContent(gmailToken, messageId);
        
        if (!emailData) {
          console.log(`SCAN-DEBUG: No email data for message ${messageId}, skipping`);
          continue;
        }
        
        // Extract email details
        const headers = emailData.payload.headers || [];
        const { subject, from, date } = parseEmailHeaders(headers);
        const emailBody = extractEmailBody(emailData);
        
        console.log(`SCAN-DEBUG: Email details - Subject: "${subject}", From: "${from}"`);
        
        // Store email data in database
        const emailDataRecord = {
          scan_id: scanId,
          user_id: userId,
          gmail_message_id: messageId,
          subject: subject,
          sender: from,
          date: date,
          content: emailBody,
          content_preview: emailBody.substring(0, 500),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        console.log(`SCAN-DEBUG: Storing email data for message ${messageId}`);
        const { data: emailDataResult, error: emailDataError } = await supabase
          .from('email_data')
          .insert(emailDataRecord)
          .select('id')
          .single();
          
        if (emailDataError) {
          console.error('SCAN-DEBUG: Error storing email data:', emailDataError);
          continue; // Skip this email if we can't store the data
        } else {
          console.log(`SCAN-DEBUG: Successfully stored email data for message ${messageId} with ID: ${emailDataResult.id}`);
        }
        
        // Analyze email with pattern matching (NO Gemini API calls)
        console.log(`SCAN-DEBUG: Analyzing email with pattern matching: "${subject}"`);
        let analysis;
        try {
          analysis = await analyzeEmailWithPatternMatching(emailData);
          console.log(`SCAN-DEBUG: Pattern matching result for email ${messageId}:`, JSON.stringify(analysis));
        } catch (analysisError) {
          console.error(`SCAN-DEBUG: Error analyzing email with pattern matching:`, analysisError);
          console.error(`SCAN-DEBUG: Analysis error stack:`, analysisError.stack);
          // Continue with next email instead of failing completely
          analysis = { isSubscription: false, confidence: 0 };
        }

        // Store analysis result in database for Edge Function to process
        if (analysis.isSubscription && analysis.confidence > 0.6) {
          console.log(`SCAN-DEBUG: Detected potential subscription: ${analysis.serviceName} (${analysis.confidence} confidence)`);
          
          // Store the analysis result for the Edge Function to process with Gemini
          const analysisRecord = {
            email_data_id: emailDataResult.id, // Use the actual ID from the email_data insert
            user_id: userId,
            scan_id: scanId,
            subscription_name: analysis.serviceName,
            price: analysis.amount || 0,
            currency: analysis.currency || 'USD',
            billing_cycle: analysis.billingFrequency || 'monthly',
            next_billing_date: analysis.nextBillingDate,
            service_provider: analysis.serviceName,
            confidence_score: analysis.confidence,
            analysis_status: 'pending', // Will be updated by Edge Function
            gemini_response: null, // Will be filled by Edge Function
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          // Insert the analysis record into the database
          const { error: analysisInsertError } = await supabase
            .from('subscription_analysis')
            .insert(analysisRecord);
            
          if (analysisInsertError) {
            console.error('SCAN-DEBUG: Error storing analysis record:', analysisInsertError);
          } else {
            console.log(`SCAN-DEBUG: Stored analysis record for Edge Function processing`);
          }
        }
        
        processedCount++;
        console.log(`SCAN-DEBUG: Successfully processed email ${i + 1}/${emails.length} (${processedCount} unique emails processed)`);
        
      } catch (emailError) {
        console.error(`SCAN-DEBUG: Error processing email ${i + 1}:`, emailError);
        console.error(`SCAN-DEBUG: Error stack:`, emailError.stack);
        // Continue with next email instead of failing completely
        continue;
      }
    }

    console.log('SCAN-DEBUG: Email processing loop completed');
    
    // Count potential subscriptions found by pattern matching
    const { data: potentialSubscriptions, error: potentialSubsError } = await supabase
      .from('subscription_analysis')
      .select('id')
      .eq('scan_id', scanId)
      .eq('analysis_status', 'pending');
    
    const potentialSubscriptionCount = potentialSubscriptions?.length || 0;
    console.log(`SCAN-DEBUG: Potential subscriptions found by pattern matching: ${potentialSubscriptionCount}`);
    
    // Update final status to ready_for_analysis so Edge Function can process with Gemini
    console.log('SCAN-DEBUG: Setting scan status to ready_for_analysis');
    await updateScanStatus(scanId, userId, {
      status: 'ready_for_analysis',
      progress: PROGRESS.ready_for_analysis,
      emails_processed: processedCount,
      subscriptions_found: potentialSubscriptionCount,
      completed_at: new Date().toISOString()
    });
    
    // Manually trigger the Gemini Edge Function to ensure it gets called
    console.log('SCAN-DEBUG: Manually triggering Gemini Edge Function');
    try {
      const triggerResponse = await fetch(
        "https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan",
        { 
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );
      
      if (triggerResponse.ok) {
        const triggerData = await triggerResponse.json();
        console.log('SCAN-DEBUG: Gemini Edge Function triggered successfully:', triggerData);
      } else {
        const errorText = await triggerResponse.text();
        console.error('SCAN-DEBUG: Failed to trigger Gemini Edge Function:', triggerResponse.status, errorText);
      }
    } catch (triggerError) {
      console.error('SCAN-DEBUG: Error triggering Gemini Edge Function:', triggerError);
    }
            
    console.log(`SCAN-DEBUG: Email processing completed for scan ${scanId}`);
    console.log(`SCAN-DEBUG: Total emails processed: ${processedCount}`);
    console.log(`SCAN-DEBUG: Potential subscriptions found: ${potentialSubscriptionCount}`);
    console.log(`SCAN-DEBUG: Scan status set to 'ready_for_analysis' - Edge Function will process with Gemini AI`);

  } catch (error) {
    console.error('SCAN-DEBUG: Error in processEmails:', error);
    console.error('SCAN-DEBUG: Error stack:', error.stack);
    await updateScanStatus(scanId, userId, {
      status: 'error',
      progress: 0
    });
    throw error;
  }
};

export default async function handler(req, res) {
  console.log('SCAN-DEBUG: ===== EMAIL SCAN ENDPOINT CALLED =====');
  console.log('SCAN-DEBUG: Method:', req.method);
  console.log('SCAN-DEBUG: URL:', req.url);
  console.log('SCAN-DEBUG: Headers:', {
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Present' : 'Missing',
    'x-gmail-token': req.headers['x-gmail-token'] ? 'Present' : 'Missing'
  });
  console.log('SCAN-DEBUG: Body keys:', Object.keys(req.body || {}));
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    console.log('SCAN-DEBUG: Handling OPTIONS preflight request');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    console.log('SCAN-DEBUG: Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('SCAN-DEBUG: Starting email scan processing...');
    
    // First, try to get token from Authorization header (preferred method)
    let token = null;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('SCAN-DEBUG: Found token in Authorization header, length:', token.length);
    } else if (req.body.token) {
      token = req.body.token;
      console.log('SCAN-DEBUG: Found token in request body, length:', token.length);
    }
    
    if (!token) {
      console.log('SCAN-DEBUG: No token provided in header or body');
      return res.status(400).json({ error: 'Token is required' });
    }

    console.log('SCAN-DEBUG: About to verify JWT token...');
    // Verify the JWT token first
    let decoded;
    try {
      const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
      console.log('SCAN-DEBUG: Using JWT secret:', jwtSecret.substring(0, 3) + '...');
      decoded = jwt.verify(token, jwtSecret);
      console.log('SCAN-DEBUG: JWT token verified successfully');
      console.log('SCAN-DEBUG: Decoded JWT payload keys:', Object.keys(decoded));
    } catch (jwtError) {
      console.log('SCAN-DEBUG: JWT verification failed:', jwtError.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get user ID from decoded token
    const userId = decoded.id || decoded.sub;
    if (!userId) {
      console.log('SCAN-DEBUG: No user ID in token');
      console.log('SCAN-DEBUG: Available fields:', Object.keys(decoded));
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    console.log('SCAN-DEBUG: User ID from token:', userId);

    console.log('SCAN-DEBUG: About to extract Gmail token...');
    // Extract Gmail token from JWT
    let gmailToken = extractGmailToken(token);
    if (!gmailToken) {
      console.log('SCAN-DEBUG: Failed to extract Gmail token from JWT');
      console.log('SCAN-DEBUG: JWT payload keys:', Object.keys(decoded));
      
      // Check if we have a Gmail token in the request headers as fallback
      const headerGmailToken = req.headers['x-gmail-token'];
      if (headerGmailToken) {
        console.log('SCAN-DEBUG: Using Gmail token from X-Gmail-Token header');
        gmailToken = headerGmailToken;
      } else {
        console.log('SCAN-DEBUG: No Gmail token found in JWT or headers');
        return res.status(400).json({ 
          error: 'Gmail access token not found',
          message: 'Please re-authenticate with Gmail to scan your emails'
        });
      }
    }

    console.log('SCAN-DEBUG: About to validate Gmail token...');
    // Validate Gmail token
    const isValidToken = await validateGmailToken(gmailToken);
    if (!isValidToken) {
      console.log('SCAN-DEBUG: Gmail token validation failed');
      return res.status(401).json({ 
        error: 'Invalid Gmail token',
        message: 'Your Gmail access has expired. Please re-authenticate.'
      });
    }

    console.log('SCAN-DEBUG: Gmail token validated successfully');

    console.log('SCAN-DEBUG: About to create scan record...');
    // Create scan record
    const { scanId, dbUserId } = await createScanRecord(userId, decoded);
    console.log('SCAN-DEBUG: Created scan record with ID:', scanId);
    console.log('SCAN-DEBUG: Using database user ID:', dbUserId);

    // Start email processing in background
    console.log('SCAN-DEBUG: About to start processEmails and await completion');
    console.log('SCAN-DEBUG: Gmail token available:', !!gmailToken);
    console.log('SCAN-DEBUG: Scan ID:', scanId);
    console.log('SCAN-DEBUG: Database User ID:', dbUserId);
    console.log('SCAN-DEBUG: Starting processEmails...');
    try {
      await processEmails(gmailToken, scanId, dbUserId);
      console.log('SCAN-DEBUG: processEmails completed successfully');
      res.status(202).json({ success: true, scanId: scanId });
    } catch (error) {
      console.error('SCAN-DEBUG: Error in processEmails:', error);
      console.error('SCAN-DEBUG: Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to process emails', details: error.message });
    }

  } catch (error) {
    console.error('SCAN-DEBUG: Error in email scan handler:', error);
    console.error('SCAN-DEBUG: Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}