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

// Add unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('SCAN-DEBUG: Unhandled Promise Rejection at:', promise, 'reason:', reason);
  console.error('SCAN-DEBUG: Unhandled rejection stack:', reason?.stack);
  console.error('SCAN-DEBUG: Unhandled rejection name:', reason?.name);
  console.error('SCAN-DEBUG: Unhandled rejection message:', reason?.message);
});

process.on('uncaughtException', (error) => {
  console.error('SCAN-DEBUG: Uncaught Exception:', error);
  console.error('SCAN-DEBUG: Uncaught exception stack:', error.stack);
  console.error('SCAN-DEBUG: Uncaught exception name:', error.name);
  console.error('SCAN-DEBUG: Uncaught exception message:', error.message);
});

// Helper function to extract Gmail token from JWT
const extractGmailToken = (token) => {
  try {
    console.log('SCAN-DEBUG: Extracting Gmail token from JWT...');
    console.log('SCAN-DEBUG: JWT token length:', token?.length || 0);
    
    if (!token) {
      console.error('SCAN-DEBUG: No JWT token provided to extractGmailToken');
      return null;
    }
    
    // Try to decode the JWT without verification first
    const payload = jsonwebtoken.decode(token);
    
    if (!payload) {
      console.error('SCAN-DEBUG: Failed to decode JWT payload');
      return null;
    }
    
    console.log('SCAN-DEBUG: JWT payload keys:', Object.keys(payload));
    console.log('SCAN-DEBUG: JWT payload type:', typeof payload);
    
    // Log the email address associated with the token
    if (payload.email) {
      console.log('SCAN-DEBUG: JWT contains email:', payload.email);
    }
    
    if (payload.gmail_email) {
      console.log('SCAN-DEBUG: JWT contains gmail_email:', payload.gmail_email);
    }
    
    // Check for Gmail token in various possible fields
    if (payload.gmail_token) {
      console.log('SCAN-DEBUG: Found gmail_token in JWT, length:', payload.gmail_token.length);
      return payload.gmail_token;
    }
    
    if (payload.access_token) {
      console.log('SCAN-DEBUG: Found access_token in JWT, length:', payload.access_token.length);
      return payload.access_token;
    }
    
    if (payload.google_token) {
      console.log('SCAN-DEBUG: Found google_token in JWT, length:', payload.google_token.length);
      return payload.google_token;
    }
    
    if (payload.oauth_token) {
      console.log('SCAN-DEBUG: Found oauth_token in JWT, length:', payload.oauth_token.length);
      return payload.oauth_token;
    }
    
    // Try to verify the JWT with the secret to get the actual payload
    try {
      const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
      const verifiedPayload = jsonwebtoken.verify(token, jwtSecret);
      console.log('SCAN-DEBUG: JWT verification successful, verified payload keys:', Object.keys(verifiedPayload));
      
      // Check verified payload for Gmail token
      if (verifiedPayload.gmail_token) {
        console.log('SCAN-DEBUG: Found gmail_token in verified JWT, length:', verifiedPayload.gmail_token.length);
        return verifiedPayload.gmail_token;
      }
      
      if (verifiedPayload.access_token) {
        console.log('SCAN-DEBUG: Found access_token in verified JWT, length:', verifiedPayload.access_token.length);
        return verifiedPayload.access_token;
      }
      
      if (verifiedPayload.google_token) {
        console.log('SCAN-DEBUG: Found google_token in verified JWT, length:', verifiedPayload.google_token.length);
        return verifiedPayload.google_token;
      }
      
      if (verifiedPayload.oauth_token) {
        console.log('SCAN-DEBUG: Found oauth_token in verified JWT, length:', verifiedPayload.oauth_token.length);
        return verifiedPayload.oauth_token;
      }
      
      console.error('SCAN-DEBUG: No Gmail token found in verified JWT payload');
      console.error('SCAN-DEBUG: Verified JWT payload keys:', Object.keys(verifiedPayload));
      
    } catch (verifyError) {
      console.error('SCAN-DEBUG: JWT verification failed:', verifyError.message);
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
    console.error('SCAN-DEBUG: Error stack:', error.stack);
    return null;
  }
};

// Helper function to fetch subscription examples
const fetchSubscriptionExamples = async () => {
  console.log('SCAN-DEBUG: Fetching subscription examples...');
  console.log('SCAN-DEBUG: Function called at:', new Date().toISOString());
  console.log('SCAN-DEBUG: Supabase URL:', supabaseUrl ? 'defined' : 'undefined');
  console.log('SCAN-DEBUG: Supabase key:', supabaseKey ? 'defined' : 'undefined');
  
  try {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    console.log('SCAN-DEBUG: About to make REST API call to fetch subscription examples...');
    
    // Use direct fetch instead of Supabase client to avoid hanging
    const response = await fetch(`${supabaseUrl}/rest/v1/subscription_examples?select=service_name,sender_pattern,subject_pattern`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('SCAN-DEBUG: Subscription examples API response status:', response.status);
    
    if (!response.ok) {
      console.error('SCAN-DEBUG: Error fetching subscription examples:', response.status, response.statusText);
      return [];
    }
    
    const data = await response.json();
    console.log(`SCAN-DEBUG: Found ${data.length} subscription examples`);
    return data || [];
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('SCAN-DEBUG: Subscription examples fetch timed out');
    } else {
      console.error('SCAN-DEBUG: Exception fetching subscription examples:', error);
      console.error('SCAN-DEBUG: Error stack:', error.stack);
    }
    return [];
  }
};

// Helper function to fetch emails from Gmail
const fetchGmailEmails = async (gmailToken) => {
  console.log('SCAN-DEBUG: Fetching emails from Gmail...');
  console.log('SCAN-DEBUG: Gmail token length:', gmailToken?.length || 0);
  
  try {
    // Use a more comprehensive query to get subscription-related emails
    const query = 'subject:(subscription OR receipt OR invoice OR payment OR billing OR renewal OR "monthly" OR "yearly" OR "annual" OR "premium" OR "pro" OR "upgrade")';
    const encodedQuery = encodeURIComponent(query);
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodedQuery}&maxResults=100`;
    
    console.log('SCAN-DEBUG: Gmail API URL:', url);
    console.log('SCAN-DEBUG: Search query:', query);
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${gmailToken}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('SCAN-DEBUG: Gmail API response status:', response.status);
    console.log('SCAN-DEBUG: Gmail API response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('SCAN-DEBUG: Gmail API error:', response.status, response.statusText);
      console.error('SCAN-DEBUG: Gmail API error details:', errorText);
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('SCAN-DEBUG: Gmail API response data keys:', Object.keys(data));
    
    const messages = data.messages || [];
    console.log(`SCAN-DEBUG: Fetched ${messages.length} emails from Gmail`);
    
    if (messages.length === 0) {
      console.log('SCAN-DEBUG: No emails found with the current query, trying broader search...');
      
      // Try a broader search if no emails found
      const broaderQuery = 'subject:(email OR mail OR message)';
      const broaderEncodedQuery = encodeURIComponent(broaderQuery);
      const broaderUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${broaderEncodedQuery}&maxResults=50`;
      
      console.log('SCAN-DEBUG: Trying broader search with URL:', broaderUrl);
      
      // Add timeout for broader search too
      const broaderController = new AbortController();
      const broaderTimeoutId = setTimeout(() => broaderController.abort(), 30000);
      
      const broaderResponse = await fetch(broaderUrl, {
        headers: {
          Authorization: `Bearer ${gmailToken}`,
          'Content-Type': 'application/json',
        },
        signal: broaderController.signal
      });
      
      clearTimeout(broaderTimeoutId);
      
      if (broaderResponse.ok) {
        const broaderData = await broaderResponse.json();
        const broaderMessages = broaderData.messages || [];
        console.log(`SCAN-DEBUG: Broader search found ${broaderMessages.length} emails`);
        return broaderMessages;
      } else {
        console.log('SCAN-DEBUG: Broader search also failed');
      }
    }
    
    return messages;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('SCAN-DEBUG: Gmail API request timed out');
      throw new Error('Gmail API request timed out. Please try again.');
    }
    console.error('SCAN-DEBUG: Error fetching emails from Gmail:', error);
    console.error('SCAN-DEBUG: Error stack:', error.stack);
    throw error; // Re-throw to be handled by the calling function
  }
};

// Helper function to process emails for subscriptions
const processEmailsForSubscriptions = async (emails, subscriptionExamples, gmailToken, scanId, userId) => {
  console.log('SCAN-DEBUG: Processing emails for subscriptions...');
  console.log(`SCAN-DEBUG: Processing ${emails.length} emails`);
  
  const subscriptionEmails = [];
  let processedCount = 0;
  let uniqueEmailsProcessed = 0;
  
  // Load existing subscriptions for duplicate prevention
  console.log('SCAN-DEBUG: Loading existing subscriptions for duplicate prevention');
  let existingSubscriptions = [];
  try {
    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=name`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (existingResponse.ok) {
      const existingData = await existingResponse.json();
      existingSubscriptions = existingData.map(sub => normalizeServiceName(sub.name));
      console.log(`SCAN-DEBUG: Loaded ${existingSubscriptions.length} existing subscriptions for duplicate prevention`);
    }
  } catch (error) {
    console.error('SCAN-DEBUG: Error loading existing subscriptions:', error);
  }
  
  for (let i = 0; i < emails.length; i++) {
    const message = emails[i];
    const messageId = message.id || message;
    
    try {
      console.log(`SCAN-DEBUG: Processing email ${i + 1}/${emails.length}`);
      
      // Update progress
      await updateScanStatus(scanId, userId, {
        progress: 30 + Math.round((i / emails.length) * 40),
        emails_processed: i
      });
      
      console.log(`SCAN-DEBUG: Fetching content for email ${messageId}`);
      console.log(`SCAN-DEBUG: Fetching content for email ID: ${messageId}`);
      
      // Fetch email content
      const emailData = await fetchEmailContent(gmailToken, messageId);
      if (!emailData) {
        console.log(`SCAN-DEBUG: No email data for message ${messageId}, skipping`);
        continue;
      }
      
      // Extract email details
      const headers = emailData.payload?.headers || [];
      const parsedHeaders = parseEmailHeaders(headers);
      const emailBody = extractEmailBody(emailData);
      
      console.log(`SCAN-DEBUG: Email details - Subject: "${parsedHeaders.subject}", From: "${parsedHeaders.from}"`);
      
      // Store email data in database
      console.log(`SCAN-DEBUG: Storing email data for message ${messageId}`);
      console.log('SCAN-DEBUG: Using REST API to store email data...');
      
      const emailDataRecord = {
        scan_id: scanId,
        user_id: userId,
        gmail_message_id: messageId,
        subject: parsedHeaders.subject,
        sender: parsedHeaders.from,
        date: parsedHeaders.date,
        content: emailBody,
        content_preview: emailBody.substring(0, 500),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const storeResponse = await fetch(`${supabaseUrl}/rest/v1/email_data`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(emailDataRecord)
      });
      
      let emailDataId = null;
      if (storeResponse.ok) {
        const storeData = await storeResponse.json();
        emailDataId = storeData[0].id;
        console.log(`SCAN-DEBUG: REST API successful, got ID: ${emailDataId}`);
        console.log(`SCAN-DEBUG: Successfully stored email data for message ${messageId} with ID: ${emailDataId}`);
      } else {
        console.error('SCAN-DEBUG: Error storing email data:', storeResponse.status, storeResponse.statusText);
        continue;
      }
      
      console.log(`SCAN-DEBUG: Validated email_data_id: ${emailDataId}`);
      
      // Analyze email with pattern matching
      console.log(`SCAN-DEBUG: Analyzing email with pattern matching: "${parsedHeaders.subject}"`);
      const analysis = await analyzeEmailWithPatternMatching(emailData);
      
      console.log(`SCAN-DEBUG: Pattern matching result for email ${messageId}:`, JSON.stringify(analysis));
      
      if (analysis.isSubscription && analysis.confidence > 0.6) {
        console.log(`SCAN-DEBUG: Detected potential subscription: ${analysis.serviceName} (${analysis.confidence} confidence)`);
        
        // Check for duplicates
        const normalizedServiceName = normalizeServiceName(analysis.serviceName);
        if (existingSubscriptions.includes(normalizedServiceName)) {
          console.log(`SCAN-DEBUG: Subscription "${analysis.serviceName}" already exists, skipping`);
          continue;
        }
        
        // Create analysis record
        console.log(`SCAN-DEBUG: About to insert analysis record with email_data_id: ${emailDataId}`);
        
        const analysisRecord = {
          email_data_id: emailDataId,
          user_id: userId,
          scan_id: scanId,
          subscription_name: analysis.serviceName,
          price: analysis.amount || 0,
          currency: analysis.currency || 'USD',
          billing_cycle: analysis.billingFrequency || 'monthly',
          next_billing_date: analysis.nextBillingDate,
          service_provider: analysis.serviceName,
          confidence_score: analysis.confidence,
          analysis_status: 'pending',
          gemini_response: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        console.log('SCAN-DEBUG: Analysis record keys:', Object.keys(analysisRecord));
        
        const analysisResponse = await fetch(`${supabaseUrl}/rest/v1/subscription_analysis`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(analysisRecord)
        });
        
        if (analysisResponse.ok) {
          console.log('SCAN-DEBUG: Stored analysis record for Edge Function processing');
          
          // Add to subscription emails array for further processing
        subscriptionEmails.push({
          messageId,
          emailData,
          analysis,
          subject: parsedHeaders.subject,
          from: parsedHeaders.from,
          date: parsedHeaders.date,
            emailBody,
            emailDataId
        });
          
          uniqueEmailsProcessed++;
        } else {
          console.error('SCAN-DEBUG: Error creating analysis record:', analysisResponse.status, analysisResponse.statusText);
        }
      }
      
      processedCount++;
      console.log(`SCAN-DEBUG: Successfully processed email ${i + 1}/${emails.length} (${uniqueEmailsProcessed} unique emails processed)`);
      
    } catch (error) {
      console.error(`SCAN-DEBUG: Error processing email ${i + 1}:`, error);
      // Continue with next email
    }
  }
  
  console.log(`SCAN-DEBUG: Processed ${processedCount} emails, found ${subscriptionEmails.length} subscriptions`);
  return { subscriptionEmails, processedCount };
};

// Helper function to store email data
const storeEmailData = async (subscriptionEmails, scanId, userId) => {
  console.log('SCAN-DEBUG: Storing email data...');
  
  for (const email of subscriptionEmails) {
    try {
      const emailDataRecord = {
        scan_id: scanId,
        user_id: userId,
        gmail_message_id: email.messageId,
        subject: email.subject,
        sender: email.from,
        date: email.date,
        content: email.emailBody,
        content_preview: email.emailBody.substring(0, 500),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const response = await fetch(`${supabaseUrl}/rest/v1/email_data`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(emailDataRecord)
      });
      
      if (!response.ok) {
        console.error('SCAN-DEBUG: Error storing email data:', response.status, response.statusText);
      } else {
        const data = await response.json();
        console.log(`SCAN-DEBUG: Stored email data with ID: ${data[0].id}`);
        email.emailDataId = data[0].id; // Store for analysis record
      }
    } catch (error) {
      console.error('SCAN-DEBUG: Exception storing email data:', error);
    }
  }
};

// Helper function to create subscription analysis records
const createSubscriptionAnalysisRecords = async (subscriptionEmails, scanId, userId) => {
  console.log('SCAN-DEBUG: Creating subscription analysis records...');
  
  for (const email of subscriptionEmails) {
    if (!email.emailDataId) {
      console.log('SCAN-DEBUG: Skipping analysis record - no email data ID');
      continue;
    }
    
    try {
      const analysisRecord = {
        email_data_id: email.emailDataId,
        user_id: userId,
        scan_id: scanId,
        subscription_name: email.analysis.serviceName,
        price: email.analysis.amount || 0,
        currency: email.analysis.currency || 'USD',
        billing_cycle: email.analysis.billingFrequency || 'monthly',
        next_billing_date: email.analysis.nextBillingDate,
        service_provider: email.analysis.serviceName,
        confidence_score: email.analysis.confidence,
        analysis_status: 'pending',
        gemini_response: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const response = await fetch(`${supabaseUrl}/rest/v1/subscription_analysis`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(analysisRecord)
      });
      
      if (!response.ok) {
        console.error('SCAN-DEBUG: Error creating analysis record:', response.status, response.statusText);
      } else {
        console.log(`SCAN-DEBUG: Created analysis record for ${email.analysis.serviceName}`);
      }
    } catch (error) {
      console.error('SCAN-DEBUG: Exception creating analysis record:', error);
    }
  }
};

/**
 * Fetch emails from Gmail
 * @param {string} gmailToken - Gmail API token
 * @returns {Promise<Array>} Array of email message IDs
 */
const fetchEmailsFromGmail = async (gmailToken) => {
  console.log('SCAN-DEBUG: Starting to fetch emails from Gmail');
  console.log('SCAN-DEBUG: Function called at:', new Date().toISOString());
  console.log('SCAN-DEBUG: Gmail token length:', gmailToken?.length || 0);
  
  try {
    // First validate the token
    console.log('SCAN-DEBUG: About to validate Gmail token');
    const isValidToken = await validateGmailToken(gmailToken);
    if (!isValidToken) {
      console.error('SCAN-DEBUG: Gmail token validation failed');
      throw new Error('Gmail token validation failed');
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
    throw error; // Re-throw the error so it can be caught by the calling function
  }
};

// Function to fetch detailed email content
const fetchEmailContent = async (gmailToken, messageId) => {
  console.log(`SCAN-DEBUG: Fetching email content for message ${messageId}`);
  
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${gmailToken}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log(`SCAN-DEBUG: Gmail API response status for message ${messageId}: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SCAN-DEBUG: Gmail API error for message ${messageId}: ${response.status} ${errorText}`);
      throw new Error(`Gmail API error: ${response.status} ${errorText}`);
    }
    
    // Safely parse JSON response
    let data;
    try {
      const responseText = await response.text();
      console.log(`SCAN-DEBUG: Response text length for message ${messageId}: ${responseText.length}`);
      
      if (!responseText || responseText.trim() === '') {
        console.error(`SCAN-DEBUG: Empty response for message ${messageId}`);
        throw new Error('Empty response from Gmail API');
      }
      
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`SCAN-DEBUG: JSON parse error for message ${messageId}:`, parseError);
      console.error(`SCAN-DEBUG: Response text preview:`, responseText?.substring(0, 200));
      throw new Error(`JSON parse error: ${parseError.message}`);
    }
    
    if (!data) {
      console.error(`SCAN-DEBUG: No data returned for message ${messageId}`);
      throw new Error('No data returned from Gmail API');
    }
    
    console.log(`SCAN-DEBUG: Successfully fetched email content for message ${messageId}`);
    return data;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`SCAN-DEBUG: Gmail API request timed out for message ${messageId}`);
      throw new Error(`Gmail API request timed out for message ${messageId}`);
    }
    console.error(`SCAN-DEBUG: Error fetching email content for message ${messageId}:`, error);
    throw error;
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
  console.log('SCAN-DEBUG: Function called at:', new Date().toISOString());
  console.log('SCAN-DEBUG: Token length:', token?.length || 0);
  
  if (!token) {
    console.error('SCAN-DEBUG: No Gmail token provided');
    return false;
  }

  try {
    // Try using Google APIs library first
    console.log('SCAN-DEBUG: Trying Google APIs library validation...');
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    console.log('SCAN-DEBUG: Making test call to Gmail API');
    const response = await gmail.users.getProfile({ userId: 'me' });
    console.log('SCAN-DEBUG: Gmail API response status:', response.status);
    console.log('SCAN-DEBUG: Gmail API response data:', response.data);
    
    if (response.status === 200 && response.data) {
      console.log('SCAN-DEBUG: Gmail token validation successful (Google APIs)');
      return true;
    } else {
      console.error('SCAN-DEBUG: Gmail API returned unexpected response:', response);
      throw new Error('Unexpected response from Google APIs');
    }
  } catch (googleError) {
    console.error('SCAN-DEBUG: Google APIs validation failed:', googleError.message);
    console.error('SCAN-DEBUG: Google APIs error stack:', googleError.stack);
    
    // Fallback to direct fetch
    console.log('SCAN-DEBUG: Trying direct fetch validation...');
    try {
      const fetchResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      
      console.log('SCAN-DEBUG: Direct fetch response status:', fetchResponse.status);
      
      if (fetchResponse.ok) {
        const profileData = await fetchResponse.json();
        console.log('SCAN-DEBUG: Direct fetch validation successful:', profileData);
        return true;
      } else {
        const errorText = await fetchResponse.text();
        console.error('SCAN-DEBUG: Direct fetch validation failed:', errorText);
        return false;
      }
    } catch (fetchError) {
      console.error('SCAN-DEBUG: Direct fetch validation also failed:', fetchError.message);
      console.error('SCAN-DEBUG: Direct fetch error stack:', fetchError.stack);
      return false;
    }
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
const createScanRecord = async (req, userId, decoded) => {
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
            avatar_url: decoded.picture || null, // Use avatar_url which matches schema
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
        'Authorization': req.headers.authorization || `Bearer ${supabaseKey}`,
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
  const maxRetries = 3;
  let lastError = null;
  
  console.log(`SCAN-DEBUG: updateScanStatus called at ${new Date().toISOString()}`);
  console.log(`SCAN-DEBUG: updateScanStatus called for scan ${scanId}, user ${dbUserId}`);
  console.log(`SCAN-DEBUG: Updates to apply:`, JSON.stringify(updates, null, 2));
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`SCAN-DEBUG: updateScanStatus attempt ${attempt}/${maxRetries}`);
      console.log(`SCAN-DEBUG: updateScanStatus called for scan ${scanId}, user ${dbUserId} (attempt ${attempt}/${maxRetries})`);
      console.log(`SCAN-DEBUG: Updates to apply:`, JSON.stringify(updates, null, 2));
      
      const timestamp = new Date().toISOString();
      
      // Filter out any fields that might not exist in the scan_history table
      const allowedFields = [
        'status', 'progress', 'emails_found', 'emails_to_process', 
        'emails_processed', 'subscriptions_found', 'error_message', 
        'completed_at', 'updated_at'
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

      // Ensure email stats are properly initialized
      if (filteredUpdates.emails_found === undefined && filteredUpdates.emails_to_process === undefined && filteredUpdates.emails_processed === undefined) {
        // Only fetch current scan status if ALL email stats are missing AND we're not just updating status/progress
        const isStatusOnlyUpdate = Object.keys(filteredUpdates).every(key => 
          ['status', 'progress', 'updated_at'].includes(key)
        );
        
        if (!isStatusOnlyUpdate) {
          console.log('SCAN-DEBUG: All email stats missing and not a status-only update, fetching current scan status');
          
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          try {
            const currentScan = await fetch(`${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (currentScan.ok) {
              try {
                const responseText = await currentScan.text();
                if (responseText && responseText.trim()) {
                  const currentData = JSON.parse(responseText);
                  if (currentData && currentData.length > 0) {
                    const current = currentData[0];
                    // Use existing values or sensible defaults
                    filteredUpdates.emails_found = current.emails_found || 0;
                    filteredUpdates.emails_to_process = current.emails_to_process || 0;
                    filteredUpdates.emails_processed = current.emails_processed || 0;
                    console.log('SCAN-DEBUG: Initialized email stats from current scan:', {
                      emails_found: filteredUpdates.emails_found,
                      emails_to_process: filteredUpdates.emails_to_process,
                      emails_processed: filteredUpdates.emails_processed
                    });
                  }
                } else {
                  console.log('SCAN-DEBUG: Empty response from current scan fetch, using defaults');
                }
              } catch (parseError) {
                console.log('SCAN-DEBUG: Error parsing current scan response, using defaults:', parseError.message);
              }
            }
          } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              console.log('SCAN-DEBUG: Current scan fetch timed out, using defaults');
            } else {
              console.log('SCAN-DEBUG: Error fetching current scan, using defaults:', fetchError.message);
            }
          }
        } else {
          console.log('SCAN-DEBUG: Status-only update, skipping email stats fetch');
        }
      } else {
        // Ensure we have at least default values for missing stats
        if (filteredUpdates.emails_found === undefined) {
          filteredUpdates.emails_found = 0;
        }
        if (filteredUpdates.emails_to_process === undefined) {
          filteredUpdates.emails_to_process = 0;
        }
        if (filteredUpdates.emails_processed === undefined) {
          filteredUpdates.emails_processed = 0;
        }
      }

      console.log('SCAN-DEBUG: Final update data:', JSON.stringify(filteredUpdates, null, 2));

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(`${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(filteredUpdates),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SCAN-DEBUG: Failed to update scan status:', errorText);
        console.error('SCAN-DEBUG: Response status:', response.status);
        console.error('SCAN-DEBUG: Response headers:', Object.fromEntries(response.headers.entries()));
        throw new Error(`Failed to update scan status: ${errorText}`);
      }

      // Handle the response more carefully
      try {
        const responseText = await response.text();
        if (responseText && responseText.trim()) {
          const responseData = JSON.parse(responseText);
          console.log('SCAN-DEBUG: Successfully updated scan status. Response:', JSON.stringify(responseData, null, 2));
        } else {
          console.log('SCAN-DEBUG: Successfully updated scan status. Empty response (this is normal for PATCH operations).');
        }
      } catch (parseError) {
        console.log('SCAN-DEBUG: Successfully updated scan status. Could not parse response (this is normal for PATCH operations):', parseError.message);
      }
      
      // If we get here, the update was successful
      return;
      
    } catch (error) {
      lastError = error;
      console.error(`SCAN-DEBUG: Error updating scan status (attempt ${attempt}/${maxRetries}):`, error);
      
      // Check if this is a retryable error
      const isRetryableError = error.message.includes('EPIPE') || 
                              error.message.includes('ECONNRESET') || 
                              error.message.includes('socket hang up') ||
                              error.message.includes('network') ||
                              error.message.includes('timeout') ||
                              error.name === 'AbortError';
      
      if (attempt < maxRetries && isRetryableError) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`SCAN-DEBUG: Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('SCAN-DEBUG: Max retries reached or non-retryable error, giving up');
        throw error;
      }
    }
  }
  
  // If we get here, all retries failed
  throw lastError;
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

// New async function to process emails without blocking the response
const processEmailsAsync = async (gmailToken, scanId, userId) => {
  console.log('SCAN-DEBUG: ===== ASYNC EMAIL PROCESSING STARTED =====');
  console.log('SCAN-DEBUG: Function called at:', new Date().toISOString());
  console.log('SCAN-DEBUG: Function execution started - this should appear immediately');
  console.log('SCAN-DEBUG: THIS IS A TEST - IF YOU SEE THIS, THE FUNCTION IS BEING CALLED');
  console.log('SCAN-DEBUG: Parameters received:');
  console.log('SCAN-DEBUG: - gmailToken length:', gmailToken ? gmailToken.length : 'null');
  console.log('SCAN-DEBUG: - scanId:', scanId);
  console.log('SCAN-DEBUG: - userId:', userId);
  console.log('SCAN-DEBUG: - gmailToken type:', typeof gmailToken);
  console.log('SCAN-DEBUG: - scanId type:', typeof scanId);
  console.log('SCAN-DEBUG: - userId type:', typeof userId);
  
  console.log('SCAN-DEBUG: About to validate parameters...');
  if (!gmailToken) {
    console.error('SCAN-DEBUG: Gmail token is missing');
    throw new Error('Gmail token is required');
  }
  if (!scanId) {
    console.error('SCAN-DEBUG: Scan ID is missing');
    throw new Error('Scan ID is required');
  }
  if (!userId) {
    console.error('SCAN-DEBUG: User ID is missing');
    throw new Error('User ID is required');
  }
  
  console.log('SCAN-DEBUG: Parameters validated successfully');
  console.log('SCAN-DEBUG: About to start the main processing logic...');
  
  try {
    console.log('SCAN-DEBUG: Starting email scan process...');
    
    // Update scan status to indicate we're starting
    console.log('SCAN-DEBUG: About to update scan status to in_progress...');
    await updateScanStatus(scanId, userId, {
      status: 'in_progress',
      progress: 10,
      updated_at: new Date().toISOString()
    });
    console.log('SCAN-DEBUG: Successfully updated scan status to in_progress');
    
    console.log('SCAN-DEBUG: About to fetch subscription examples...');
    // Fetch subscription examples for pattern matching
    const subscriptionExamples = await fetchSubscriptionExamples();
    console.log('SCAN-DEBUG: Fetched subscription examples:', subscriptionExamples.length);
    
    // Update progress
    console.log('SCAN-DEBUG: About to update progress to 15...');
    await updateScanStatus(scanId, userId, {
      progress: 15,
      updated_at: new Date().toISOString()
    });
    console.log('SCAN-DEBUG: Successfully updated progress to 15');
    
    console.log('SCAN-DEBUG: About to fetch emails from Gmail...');
    console.log('SCAN-DEBUG: Calling fetchEmailsFromGmail function...');
    // Fetch emails from Gmail using the comprehensive search function
    const emails = await fetchEmailsFromGmail(gmailToken);
    console.log('SCAN-DEBUG: Fetched emails from Gmail:', emails.length);
    console.log('SCAN-DEBUG: Email IDs sample:', emails.slice(0, 3));
    
    // Update scan status with email count
    console.log('SCAN-DEBUG: About to update scan status with email count...');
    await updateScanStatus(scanId, userId, {
      progress: 20,
      emails_found: emails.length,
      emails_to_process: emails.length,
      updated_at: new Date().toISOString()
    });
    console.log('SCAN-DEBUG: Successfully updated scan status with email count');
    
    if (emails.length === 0) {
      console.log('SCAN-DEBUG: No emails found, completing scan');
      await updateScanStatus(scanId, userId, {
        status: 'ready_for_analysis',
        progress: 100,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: 'No subscription-related emails found in your Gmail account. This could mean you don\'t have any active subscriptions, or your emails are organized differently.'
      });
      
      // Return scan ID immediately to prevent timeout
      console.log('SCAN-DEBUG: Returning scanId immediately to prevent timeout:', scanId);
      return res.status(200).json({ 
        success: true, 
        scanId: scanId,
        message: 'Scan completed. No subscription emails found.',
        processingCompleted: true
      });
    }
    
    console.log('SCAN-DEBUG: About to process emails for subscriptions...');
    // Process emails to find subscriptions (this now includes storing data and creating analysis records)
    const { subscriptionEmails, processedCount } = await processEmailsForSubscriptions(
      emails, 
      subscriptionExamples, 
      gmailToken, 
      scanId, 
      userId
    );
    
    console.log('SCAN-DEBUG: Processed emails for subscriptions:', processedCount);
    console.log('SCAN-DEBUG: Found subscription emails:', subscriptionEmails.length);
    
    // Update scan status with processing results
    await updateScanStatus(scanId, userId, {
      progress: 90,
      emails_processed: processedCount,
      emails_scanned: processedCount,
      subscriptions_found: subscriptionEmails.length,
      updated_at: new Date().toISOString()
    });
    
    if (subscriptionEmails.length === 0) {
      console.log('SCAN-DEBUG: No subscriptions found, completing scan');
      await updateScanStatus(scanId, userId, {
        status: 'ready_for_analysis',
        progress: 100,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } else {
      console.log('SCAN-DEBUG: Email processing completed successfully');
      console.log('SCAN-DEBUG: Setting scan status to ready_for_analysis for Gemini processing');
      
      // Set scan status to ready_for_analysis so Gemini trigger can process pending analysis records
      await updateScanStatus(scanId, userId, {
        status: 'ready_for_analysis',
        progress: 100,
        updated_at: new Date().toISOString()
      });
      
      // Add a fallback mechanism: if Edge Function doesn't complete within 2 minutes, 
      // automatically complete the scan since pattern matching already detected subscriptions
      console.log('SCAN-DEBUG: Setting up fallback completion in 2 minutes...');
      setTimeout(async () => {
        try {
          console.log('SCAN-DEBUG: Checking if scan is still in ready_for_analysis status...');
          
          // Check current scan status
          const currentScanResponse = await fetch(
            `${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}&select=status`,
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
            if (currentScan.length > 0 && currentScan[0].status === 'ready_for_analysis') {
              console.log('SCAN-DEBUG: Scan still in ready_for_analysis status after 2 minutes');
              console.log('SCAN-DEBUG: Completing scan automatically since pattern matching detected subscriptions');
              
              // Keep scan in ready_for_analysis; do not mark completed automatically
    await updateScanStatus(scanId, userId, {
                status: 'ready_for_analysis',
      updated_at: new Date().toISOString()
    });
              console.log('SCAN-DEBUG: Scan left in ready_for_analysis via fallback; trigger will handle completion');
            } else {
              console.log('SCAN-DEBUG: Scan status changed, no fallback needed');
            }
          }
        } catch (fallbackError) {
          console.error('SCAN-DEBUG: Error in fallback completion:', fallbackError);
        }
      }, 2 * 60 * 1000); // 2 minutes
    }
    
  } catch (error) {
    console.error('SCAN-DEBUG: Error in async email processing:', error);
    console.error('SCAN-DEBUG: Error stack:', error.stack);
    console.error('SCAN-DEBUG: Error name:', error.name);
    console.error('SCAN-DEBUG: Error message:', error.message);
    
    // Update scan status to error
    try {
    await updateScanStatus(scanId, userId, {
      status: 'error',
      error_message: error.message,
      updated_at: new Date().toISOString()
    });
      console.log('SCAN-DEBUG: Successfully updated scan status to error');
    } catch (updateError) {
      console.error('SCAN-DEBUG: Failed to update scan status to error:', updateError);
    }
    
    throw error;
  }
};

// Test that the function is properly defined
console.log('SCAN-DEBUG: processEmailsAsync function definition test:');
console.log('SCAN-DEBUG: - Function exists:', typeof processEmailsAsync);
console.log('SCAN-DEBUG: - Function name:', processEmailsAsync.name);
console.log('SCAN-DEBUG: - Function is async:', processEmailsAsync.constructor.name === 'AsyncFunction');

export default async function handler(req, res) {
  console.log('SCAN-DEBUG: ===== EMAIL SCAN ENDPOINT CALLED =====');
  console.log('SCAN-DEBUG: Method:', req.method);
  console.log('SCAN-DEBUG: URL:', req.url);
  console.log('SCAN-DEBUG: Headers:', {
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Present' : 'Missing'
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
    // Verify the JWT token
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
        // Try to get Gmail token from database as final fallback
        console.log('SCAN-DEBUG: Attempting to get Gmail token from database...');
        try {
          const userEmail = decoded.email;
          console.log('SCAN-DEBUG: Looking up user tokens for email:', userEmail);
          
          const tokenResponse = await fetch(
            `${supabaseUrl}/rest/v1/user_tokens?select=access_token&user_id=eq.${userId}&provider=eq.google`,
            {
              method: 'GET',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            if (tokenData && tokenData.length > 0 && tokenData[0].access_token) {
              console.log('SCAN-DEBUG: Found Gmail token in database');
              gmailToken = tokenData[0].access_token;
            } else {
              console.log('SCAN-DEBUG: No Gmail token found in database');
            }
          } else {
            console.log('SCAN-DEBUG: Failed to fetch tokens from database:', tokenResponse.status);
          }
        } catch (dbError) {
          console.error('SCAN-DEBUG: Error fetching Gmail token from database:', dbError);
        }
      }
      
      if (!gmailToken) {
        console.log('SCAN-DEBUG: No Gmail token found in JWT, headers, or database');
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

    // Test Gmail API access with a simple call
    console.log('SCAN-DEBUG: Testing Gmail API access...');
    try {
      const testResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          Authorization: `Bearer ${gmailToken}`,
          'Content-Type': 'application/json',
        }
      });
      
      if (testResponse.ok) {
        const profileData = await testResponse.json();
        console.log('SCAN-DEBUG: Gmail API test successful, email address:', profileData.emailAddress);
      } else {
        console.error('SCAN-DEBUG: Gmail API test failed:', testResponse.status, testResponse.statusText);
        return res.status(401).json({ 
          error: 'Gmail API access failed',
          message: 'Unable to access Gmail API. Please re-authenticate.'
        });
      }
    } catch (testError) {
      console.error('SCAN-DEBUG: Gmail API test error:', testError);
      return res.status(401).json({ 
        error: 'Gmail API test failed',
        message: 'Unable to test Gmail API access. Please re-authenticate.'
      });
    }

    console.log('SCAN-DEBUG: About to create scan record...');
    // Create scan record
    const { scanId, dbUserId } = await createScanRecord(req, userId, decoded);
    console.log('SCAN-DEBUG: Created scan record with ID:', scanId);
    console.log('SCAN-DEBUG: Using database user ID:', dbUserId);

    // Process emails SYNCHRONOUSLY before sending response (this will work in serverless)
    console.log('SCAN-DEBUG: Starting SYNCHRONOUS email processing...');
    console.log('SCAN-DEBUG: This approach will work in serverless environments');
    
    try {
      // Update scan status to indicate we're starting
      console.log('SCAN-DEBUG: About to update scan status to in_progress...');
      await updateScanStatus(scanId, dbUserId, {
        status: 'in_progress',
        progress: 10,
        updated_at: new Date().toISOString()
      });
      console.log('SCAN-DEBUG: Successfully updated scan status to in_progress');
      
      console.log('SCAN-DEBUG: About to fetch subscription examples...');
      // Fetch subscription examples for pattern matching
      const subscriptionExamples = await fetchSubscriptionExamples();
      console.log('SCAN-DEBUG: Fetched subscription examples:', subscriptionExamples.length);
      
      // Update progress
      console.log('SCAN-DEBUG: About to update progress to 15...');
      await updateScanStatus(scanId, dbUserId, {
        progress: 15,
        updated_at: new Date().toISOString()
      });
      console.log('SCAN-DEBUG: Successfully updated progress to 15');
      
      console.log('SCAN-DEBUG: About to fetch emails from Gmail...');
      console.log('SCAN-DEBUG: Calling fetchEmailsFromGmail function...');
      // Fetch emails from Gmail using the comprehensive search function
      const emails = await fetchEmailsFromGmail(gmailToken);
      console.log('SCAN-DEBUG: Fetched emails from Gmail:', emails.length);
      console.log('SCAN-DEBUG: Email IDs sample:', emails.slice(0, 3));
      
      // Update scan status with email count
      console.log('SCAN-DEBUG: About to update scan status with email count...');
      await updateScanStatus(scanId, dbUserId, {
        progress: 20,
        emails_found: emails.length,
        emails_to_process: emails.length,
        updated_at: new Date().toISOString()
      });
      console.log('SCAN-DEBUG: Successfully updated scan status with email count');
      
      if (emails.length === 0) {
        console.log('SCAN-DEBUG: No emails found, completing scan');
        await updateScanStatus(scanId, dbUserId, {
          status: 'ready_for_analysis',
          progress: 100,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: 'No subscription-related emails found in your Gmail account. This could mean you don\'t have any active subscriptions, or your emails are organized differently.'
        });

    // Return scan ID immediately to prevent timeout
    console.log('SCAN-DEBUG: Returning scanId immediately to prevent timeout:', scanId);
    res.status(200).json({ 
      success: true, 
      scanId: scanId,
          message: 'Scan completed. No subscription emails found.',
          processingCompleted: true
        });
        return;
      }
      
      console.log('SCAN-DEBUG: About to process emails for subscriptions...');
      // Process emails to find subscriptions (this now includes storing data and creating analysis records)
      const { subscriptionEmails, processedCount } = await processEmailsForSubscriptions(
        emails, 
        subscriptionExamples, 
        gmailToken, 
        scanId, 
        dbUserId
      );
      
      console.log('SCAN-DEBUG: Processed emails for subscriptions:', processedCount);
      console.log('SCAN-DEBUG: Found subscription emails:', subscriptionEmails.length);
      
      // Update scan status with processing results
      await updateScanStatus(scanId, dbUserId, {
        progress: 90,
        emails_processed: processedCount,
        emails_scanned: processedCount,
        subscriptions_found: subscriptionEmails.length,
        updated_at: new Date().toISOString()
      });
      
      if (subscriptionEmails.length === 0) {
        console.log('SCAN-DEBUG: No subscriptions found, completing scan');
        await updateScanStatus(scanId, dbUserId, {
          status: 'ready_for_analysis',
          progress: 100,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else {
        console.log('SCAN-DEBUG: Email processing completed successfully');
        console.log('SCAN-DEBUG: Pattern matching detected subscriptions successfully!');
        console.log('SCAN-DEBUG: Setting scan status to ready_for_analysis for Gemini processing');
        
        // Set scan status to ready_for_analysis so Gemini trigger can process pending analysis records
        await updateScanStatus(scanId, dbUserId, {
          status: 'ready_for_analysis',
          progress: 100,
          updated_at: new Date().toISOString()
        });
        
        console.log('SCAN-DEBUG: Scan status set to ready_for_analysis - cron job will trigger Edge Function analysis');
        
        // Let the cron job handle Edge Function triggering
        console.log('SCAN-DEBUG: Cron job runs every minute and will automatically trigger analysis for scans in ready_for_analysis status');
      }
      
      // Return scan ID with completion status
      console.log('SCAN-DEBUG: Returning scanId with completion status:', scanId);
      res.status(200).json({ 
        success: true, 
        scanId: scanId,
        message: 'Scan completed successfully.',
        processingCompleted: true,
        emailsFound: emails.length,
        subscriptionsFound: subscriptionEmails.length
      });
      
    } catch (processingError) {
      console.error('SCAN-DEBUG: Error in synchronous email processing:', processingError);
      console.error('SCAN-DEBUG: Error stack:', processingError.stack);
      
      // Update scan status to error
      try {
        await updateScanStatus(scanId, dbUserId, {
        status: 'error',
          error_message: processingError.message,
        updated_at: new Date().toISOString()
        });
        console.log('SCAN-DEBUG: Successfully updated scan status to error');
      } catch (updateError) {
        console.error('SCAN-DEBUG: Failed to update scan status to error:', updateError);
      }
      
      // Return error response
      res.status(500).json({ 
        error: 'Email processing failed',
        message: processingError.message,
        scanId: scanId
      });
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