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

// Function to analyze email with Gemini AI
const analyzeEmailWithGemini = async (emailContent) => {
  console.log('SCAN-DEBUG: Analyzing email with Gemini AI');
  if (!emailContent) {
    console.error('SCAN-DEBUG: No emailContent provided to analyzeEmailWithGemini');
    return { isSubscription: false, confidence: 0 };
  }
  try {
    // Check if Gemini API key exists
    console.log(`SCAN-DEBUG: Checking for Gemini API key: ${!!process.env.GEMINI_API_KEY}`);
    console.log(`SCAN-DEBUG: Environment variables available: ${Object.keys(process.env).filter(key => key.includes('GEMINI') || key.includes('API')).join(', ')}`);
    
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not found, using fallback pattern analysis');
      
      try {
        // Extract headers for pattern analysis
        const headers = emailContent.payload.headers || [];
        const { subject, from } = parseEmailHeaders(headers);
        
        // Create a simulated subscription detection with high confidence for common services
        const fromLower = from ? from.toLowerCase() : '';
        const subjectLower = subject ? subject.toLowerCase() : '';
        
        console.log(`SCAN-DEBUG: Fallback analysis - Subject: "${subject}", From: "${from}"`);
        
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
            
            try {
              // Check for specific pricing in the email body
              const body = extractEmailBody(emailContent);
              const bodyLower = body ? body.toLowerCase() : '';
              
              // Enhanced price extraction with multiple patterns
              let amount = service.amount; // Default amount
              let currency = 'USD'; // Default currency
              
              // Look for currency symbols followed by numbers
              const currencyPatterns = [
                /\$(\d+\.?\d*)/g,  // $19.99 or $20
                /€(\d+\.?\d*)/g,  // €19.99 or €20
                /£(\d+\.?\d*)/g,  // £19.99 or £20
                /¥(\d+\.?\d*)/g,  // ¥1999 or ¥2000
              ];
              
              let foundPrice = false;
              for (const pattern of currencyPatterns) {
                const matches = bodyLower.match(pattern);
                if (matches && matches.length > 0) {
                  // Take the first match that looks like a reasonable subscription price
                  for (const match of matches) {
                    const price = parseFloat(match.replace(/[^\d.]/g, ''));
                    if (price > 0 && price < 1000) { // Reasonable subscription price range
                      amount = price;
                      foundPrice = true;
                      // Determine currency from the symbol
                      if (match.includes('€')) currency = 'EUR';
                      else if (match.includes('£')) currency = 'GBP';
                      else if (match.includes('¥')) currency = 'JPY';
                      else currency = 'USD';
                      break;
                    }
                  }
                  if (foundPrice) break;
                }
              }
              
              // If no currency symbol found, look for currency codes
              if (!foundPrice) {
                const currencyCodePatterns = [
                  /(\d+\.?\d*)\s*(usd|dollars?)/gi,
                  /(\d+\.?\d*)\s*(eur|euros?)/gi,
                  /(\d+\.?\d*)\s*(gbp|pounds?)/gi,
                ];
                
                for (const pattern of currencyCodePatterns) {
                  const matches = bodyLower.match(pattern);
                  if (matches && matches.length > 0) {
                    const price = parseFloat(matches[0].replace(/[^\d.]/g, ''));
                    if (price > 0 && price < 1000) {
                      amount = price;
                      foundPrice = true;
                      // Determine currency from the code
                      if (matches[0].toLowerCase().includes('eur')) currency = 'EUR';
                      else if (matches[0].toLowerCase().includes('gbp')) currency = 'GBP';
                      else currency = 'USD';
                      break;
                    }
                  }
                }
              }
              
              // Enhanced frequency detection
              let frequency = 'monthly'; // Default frequency
              const frequencyPatterns = [
                { pattern: /month(ly)?|per\s*month/i, value: 'monthly' },
                { pattern: /year(ly)?|annual|per\s*year/i, value: 'yearly' },
                { pattern: /week(ly)?|per\s*week/i, value: 'weekly' },
                { pattern: /quarter(ly)?|per\s*quarter/i, value: 'quarterly' },
                { pattern: /bi.?month(ly)?|every\s*2\s*months/i, value: 'bimonthly' },
                { pattern: /semi.?annual|every\s*6\s*months/i, value: 'semiannual' },
              ];
              
              for (const freqPattern of frequencyPatterns) {
                if (freqPattern.pattern.test(bodyLower) || freqPattern.pattern.test(subjectLower)) {
                  frequency = freqPattern.value;
                  break;
                }
              }
              
              // Generate next billing date based on frequency
              const nextBillingDate = new Date();
              if (frequency === 'monthly') nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
              else if (frequency === 'yearly') nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
              else if (frequency === 'weekly') nextBillingDate.setDate(nextBillingDate.getDate() + 7);
              else if (frequency === 'quarterly') nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
              else if (frequency === 'bimonthly') nextBillingDate.setMonth(nextBillingDate.getMonth() + 2);
              else if (frequency === 'semiannual') nextBillingDate.setMonth(nextBillingDate.getMonth() + 6);
              
              console.log(`SCAN-DEBUG: Extracted price: ${amount} ${currency} ${frequency}`);
              
              return {
                isSubscription: true,
                serviceName: service.name,
                amount: amount,
                currency: currency,
                billingFrequency: frequency,
                nextBillingDate: nextBillingDate.toISOString().split('T')[0],
                confidence: foundPrice ? 0.85 : 0.7 // Lower confidence if no specific price found
              };
            } catch (priceExtractionError) {
              console.error(`SCAN-DEBUG: Error in price extraction for ${service.name}:`, priceExtractionError);
              // Return a basic result without enhanced price extraction
              return {
                isSubscription: true,
                serviceName: service.name,
                amount: service.amount,
                currency: 'USD',
                billingFrequency: 'monthly',
                nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
                confidence: 0.7
              };
            }
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
          
          try {
            // Extract a service name from the sender domain
            let serviceName = 'Unknown Service';
            if (from) {
              const domainMatch = from.match(/@([^>]+)/) || from.match(/([^<\s]+)$/);
              if (domainMatch) {
                const domain = domainMatch[1].replace(/\.[^.]+$/, ''); // Remove TLD
                serviceName = domain.charAt(0).toUpperCase() + domain.slice(1);
              }
            }
            
            // Enhanced price and frequency extraction for keyword-based detection
            const body = extractEmailBody(emailContent);
            const bodyLower = body ? body.toLowerCase() : '';
            
            let amount = 9.99; // Default amount
            let currency = 'USD'; // Default currency
            let frequency = 'monthly'; // Default frequency
            
            // Look for currency symbols followed by numbers
            const currencyPatterns = [
              /\$(\d+\.?\d*)/g,  // $19.99 or $20
              /€(\d+\.?\d*)/g,  // €19.99 or €20
              /£(\d+\.?\d*)/g,  // £19.99 or £20
              /¥(\d+\.?\d*)/g,  // ¥1999 or ¥2000
            ];
            
            let foundPrice = false;
            for (const pattern of currencyPatterns) {
              const matches = bodyLower.match(pattern);
              if (matches && matches.length > 0) {
                // Take the first match that looks like a reasonable subscription price
                for (const match of matches) {
                  const price = parseFloat(match.replace(/[^\d.]/g, ''));
                  if (price > 0 && price < 1000) { // Reasonable subscription price range
                    amount = price;
                    foundPrice = true;
                    // Determine currency from the symbol
                    if (match.includes('€')) currency = 'EUR';
                    else if (match.includes('£')) currency = 'GBP';
                    else if (match.includes('¥')) currency = 'JPY';
                    else currency = 'USD';
                    break;
                  }
                }
                if (foundPrice) break;
              }
            }
            
            // If no currency symbol found, look for currency codes
            if (!foundPrice) {
              const currencyCodePatterns = [
                /(\d+\.?\d*)\s*(usd|dollars?)/gi,
                /(\d+\.?\d*)\s*(eur|euros?)/gi,
                /(\d+\.?\d*)\s*(gbp|pounds?)/gi,
              ];
              
              for (const pattern of currencyCodePatterns) {
                const matches = bodyLower.match(pattern);
                if (matches && matches.length > 0) {
                  const price = parseFloat(matches[0].replace(/[^\d.]/g, ''));
                  if (price > 0 && price < 1000) {
                    amount = price;
                    foundPrice = true;
                    // Determine currency from the code
                    if (matches[0].toLowerCase().includes('eur')) currency = 'EUR';
                    else if (matches[0].toLowerCase().includes('gbp')) currency = 'GBP';
                    else currency = 'USD';
                    break;
                  }
                }
              }
            }
            
            // Enhanced frequency detection
            const frequencyPatterns = [
              { pattern: /month(ly)?|per\s*month/i, value: 'monthly' },
              { pattern: /year(ly)?|annual|per\s*year/i, value: 'yearly' },
              { pattern: /week(ly)?|per\s*week/i, value: 'weekly' },
              { pattern: /quarter(ly)?|per\s*quarter/i, value: 'quarterly' },
              { pattern: /bi.?month(ly)?|every\s*2\s*months/i, value: 'bimonthly' },
              { pattern: /semi.?annual|every\s*6\s*months/i, value: 'semiannual' },
            ];
            
            for (const freqPattern of frequencyPatterns) {
              if (freqPattern.pattern.test(bodyLower) || freqPattern.pattern.test(subjectLower)) {
                frequency = freqPattern.value;
                break;
              }
            }
            
            // Generate next billing date based on frequency
            const nextBillingDate = new Date();
            if (frequency === 'monthly') nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
            else if (frequency === 'yearly') nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
            else if (frequency === 'weekly') nextBillingDate.setDate(nextBillingDate.getDate() + 7);
            else if (frequency === 'quarterly') nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
            else if (frequency === 'bimonthly') nextBillingDate.setMonth(nextBillingDate.getMonth() + 2);
            else if (frequency === 'semiannual') nextBillingDate.setMonth(nextBillingDate.getMonth() + 6);
            
            console.log(`SCAN-DEBUG: Keyword-based detection - Extracted price: ${amount} ${currency} ${frequency}`);
            
            return {
              isSubscription: true,
              serviceName: serviceName,
              amount: amount,
              currency: currency,
              billingFrequency: frequency,
              nextBillingDate: nextBillingDate.toISOString().split('T')[0],
              confidence: foundPrice ? 0.6 : 0.5 // Lower confidence for keyword-based detection
            };
          } catch (keywordExtractionError) {
            console.error(`SCAN-DEBUG: Error in keyword-based price extraction:`, keywordExtractionError);
            // Return a basic result without enhanced price extraction
            return {
              isSubscription: true,
              serviceName: 'Unknown Service',
              amount: 9.99,
              currency: 'USD',
              billingFrequency: 'monthly',
              nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
              confidence: 0.5
            };
          }
        }
        
        return {
          isSubscription: false,
          confidence: 0.7
        };
      } catch (fallbackError) {
        console.error('SCAN-DEBUG: Error in fallback pattern analysis:', fallbackError);
        return {
          isSubscription: false,
          confidence: 0.5
        };
      }
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

IMPORTANT: When extracting prices, look for:
- The actual amount charged (not one-time fees)
- Currency symbols ($, €, £, etc.) or currency codes (USD, EUR, etc.)
- Whether the price is per month, per year, per week, etc.
- Look for phrases like "monthly", "yearly", "annual", "weekly", "quarterly"
- Check for billing cycles in the text

Here are examples of known subscriptions with proper price extraction:

EXAMPLE 1: NBA League Pass
From: NBA <NBA@nbaemail.nba.com>
Subject: NBA League Pass Subscription Confirmation
Key indicators: "Thank you for your subscription", "NBA League Pass Season-Long", "Automatically Renewed"
Details: EUR 16.99 monthly, renewal dates indicated
Price extraction: Look for "EUR 16.99" or "€16.99" and "monthly" or "per month"

EXAMPLE 2: Babbel Language Learning
From: Apple <no_reply@email.apple.com>
Subject: Your subscription confirmation
Key indicators: "Subscription Confirmation", "automatically renews", "3-month plan"
Details: € 53,99 per 3 months, renewal date specified
Price extraction: Look for "€ 53,99" and "3-month plan" or "per 3 months"

EXAMPLE 3: Vercel Premium
From: Vercel Inc. <invoice+statements@vercel.com>
Subject: Your receipt from Vercel Inc.
Key indicators: Monthly date range (Mar 22 – Apr 21, 2025), Premium plan, recurring payment
Details: $20.00 monthly for Premium plan
Price extraction: Look for "$20.00" and "monthly" or "per month"

EXAMPLE 4: Ahrefs
From: Ahrefs <billing@ahrefs.com>
Subject: Thank you for your payment
Key indicators: "Your Subscription", "Ahrefs Starter - Monthly"
Details: €27.00 monthly, Starter plan
Price extraction: Look for "€27.00" and "Monthly" or "per month"

Now analyze the following email content to determine if it relates to a subscription service.
Look for similar patterns as in the examples above.

If this email is about a subscription, extract the following details:
- Service name: The name of the subscription service (be specific)
- Price: The amount charged (look for currency symbols and amounts, ignore one-time fees, focus on recurring charges)
- Currency: USD, EUR, etc. (extract from the price or look for currency indicators)
- Billing frequency: monthly, yearly, quarterly, weekly, etc. (look for words like "monthly", "annual", "yearly", "weekly", "quarterly", "per month", "per year", etc.)
- Next billing date: When the next payment will occur (in YYYY-MM-DD format if possible)

IMPORTANT PRICE EXTRACTION RULES:
1. Look for currency symbols ($, €, £, ¥, etc.) followed by numbers
2. Look for currency codes (USD, EUR, GBP, etc.) followed by numbers
3. Look for numbers followed by currency words (dollars, euros, pounds, etc.)
4. Check if the price is per month, per year, per week, etc.
5. If multiple prices are mentioned, choose the recurring subscription price, not one-time fees
6. If no specific price is found, use 0.00 but note this in confidence

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
    const fullUpdates = {
      ...updates,
      timestamp,
      last_update: timestamp
    };

    // Only fetch current scan status if email stats are completely missing (undefined/null)
    // Don't override explicit 0 values
    if (fullUpdates.emails_found === undefined || fullUpdates.emails_found === null ||
        fullUpdates.emails_to_process === undefined || fullUpdates.emails_to_process === null ||
        fullUpdates.emails_processed === undefined || fullUpdates.emails_processed === null) {
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
          if (fullUpdates.emails_found === undefined || fullUpdates.emails_found === null) {
            fullUpdates.emails_found = current.emails_found || 0;
          }
          if (fullUpdates.emails_to_process === undefined || fullUpdates.emails_to_process === null) {
            fullUpdates.emails_to_process = current.emails_to_process || 0;
          }
          if (fullUpdates.emails_processed === undefined || fullUpdates.emails_processed === null) {
            fullUpdates.emails_processed = current.emails_processed || 0;
          }
        }
      }
    }

    console.log('SCAN-DEBUG: Final update data:', JSON.stringify(fullUpdates, null, 2));

    const response = await fetch(`${supabaseUrl}/rest/v1/scan_history?scan_id=eq.${scanId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fullUpdates)
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
    console.log('SCAN-DEBUG: About to update initial scan status');
    // Update scan status to in_progress
    await updateScanStatus(scanId, userId, {
      status: 'in_progress',
      progress: 10
    });
    console.log('SCAN-DEBUG: Initial scan status updated successfully');

    // Check for existing subscriptions to avoid duplicates
    console.log('SCAN-DEBUG: Checking for existing subscriptions to avoid duplicates');
    console.log('SCAN-DEBUG: About to query subscriptions table for user ID:', userId);
    let existingSubscriptions = null;
    let existingSubsError = null;
    
    try {
      console.log('SCAN-DEBUG: Executing Supabase query for existing subscriptions...');
      const result = await supabase
        .from('subscriptions')
        .select('name, provider, email_id')
        .eq('user_id', userId);
      
      console.log('SCAN-DEBUG: Supabase query completed');
      console.log('SCAN-DEBUG: Query result:', result);
      
      existingSubscriptions = result.data;
      existingSubsError = result.error;
    } catch (supabaseError) {
      console.error('SCAN-DEBUG: Exception during existing subscriptions query:', supabaseError);
      console.error('SCAN-DEBUG: Exception stack:', supabaseError.stack);
      existingSubsError = supabaseError;
    }
    
    console.log('SCAN-DEBUG: Existing subscriptions query completed');
    console.log('SCAN-DEBUG: existingSubscriptions:', existingSubscriptions);
    console.log('SCAN-DEBUG: existingSubsError:', existingSubsError);
    
    if (existingSubsError) {
      console.error('SCAN-DEBUG: Error fetching existing subscriptions:', existingSubsError);
      // Continue anyway, we'll just not have duplicate checking
    } else {
      console.log(`SCAN-DEBUG: Found ${existingSubscriptions?.length || 0} existing subscriptions`);
    }
    
    // Create a set of existing subscription identifiers for quick lookup
    console.log('SCAN-DEBUG: Creating existing subscription identifiers set...');
    const existingSubscriptionIds = new Set();
    if (existingSubscriptions) {
      existingSubscriptions.forEach(sub => {
        // Create unique identifiers based on name, provider, and email_id
        const id1 = `${sub.name?.toLowerCase()}-${sub.provider?.toLowerCase()}`;
        const id2 = sub.email_id ? `email-${sub.email_id}` : null;
        if (id1) existingSubscriptionIds.add(id1);
        if (id2) existingSubscriptionIds.add(id2);
      });
    }
    console.log('SCAN-DEBUG: Existing subscription identifiers set created');
    
    console.log('SCAN-DEBUG: About to fetch emails from Gmail');
    console.log('SCAN-DEBUG: Gmail token available for fetchEmailsFromGmail:', !!gmailToken);
    console.log('SCAN-DEBUG: Gmail token length:', gmailToken?.length || 0);
    
    // Fetch emails from Gmail
    let emails = [];
    try {
      console.log('SCAN-DEBUG: Calling fetchEmailsFromGmail function...');
      emails = await fetchEmailsFromGmail(gmailToken);
      console.log(`SCAN-DEBUG: Fetched ${emails.length} emails from Gmail`);
      console.log('SCAN-DEBUG: Email fetching completed successfully');
    } catch (fetchError) {
      console.error('SCAN-DEBUG: Error in fetchEmailsFromGmail:', fetchError);
      console.error('SCAN-DEBUG: Fetch error stack:', fetchError.stack);
      console.log('SCAN-DEBUG: Continuing with empty emails array due to fetch error');
      emails = [];
    }
    
    if (emails.length === 0) {
      console.log('SCAN-DEBUG: No emails found, setting scan to ready_for_analysis');
      await updateScanStatus(scanId, userId, {
        status: 'ready_for_analysis',
        progress: 100,
        emails_found: 0,
        emails_processed: 0,
        subscriptions_found: 0,
        completed_at: new Date().toISOString()
      });
      return;
    }
    
    // Update scan status with email count
    await updateScanStatus(scanId, userId, {
      emails_found: emails.length,
      emails_to_process: emails.length,
      progress: 20
    });
    console.log('SCAN-DEBUG: Updated scan status with email count');

    let processedCount = 0;
    let subscriptionsFound = 0;
    
    console.log('SCAN-DEBUG: Starting email processing loop');
    // Process each email
    for (let i = 0; i < emails.length; i++) {
      try {
        console.log(`SCAN-DEBUG: Processing email ${i + 1}/${emails.length}`);
        const message = emails[i];
        
        // Update progress
        const progress = 20 + (i / emails.length) * 30; // 20-50% for email processing
        await updateScanStatus(scanId, userId, {
          progress: Math.round(progress),
          emails_processed: i
        });
        
        // Fetch email content
        console.log(`SCAN-DEBUG: Fetching content for email ${message.id || message}`);
        const emailData = await fetchEmailContent(gmailToken, message.id || message);
        
        if (!emailData) {
          console.log(`SCAN-DEBUG: No email data for message ${message.id || message}, skipping`);
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
          gmail_message_id: message.id || message,
          subject: subject,
          sender: from,
          date: date,
          content: emailBody,
          content_preview: emailBody.substring(0, 500),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        console.log(`SCAN-DEBUG: Storing email data for message ${message.id || message}`);
        const { error: emailDataError } = await supabase
          .from('email_data')
          .insert(emailDataRecord);
          
        if (emailDataError) {
          console.error('SCAN-DEBUG: Error storing email data:', emailDataError);
        } else {
          console.log(`SCAN-DEBUG: Successfully stored email data for message ${message.id || message}`);
        }
        
        // Analyze email with Gemini
        console.log(`SCAN-DEBUG: Analyzing email with Gemini: "${subject}"`);
        let analysis;
        try {
          analysis = await analyzeEmailWithGemini(emailData);
          console.log(`SCAN-DEBUG: Gemini analysis result for email ${message.id || message}:`, JSON.stringify(analysis));
        } catch (analysisError) {
          console.error(`SCAN-DEBUG: Error analyzing email with Gemini:`, analysisError);
          console.error(`SCAN-DEBUG: Analysis error stack:`, analysisError.stack);
          // Continue with next email instead of failing completely
          analysis = { isSubscription: false, confidence: 0 };
        }

        // If subscription detected with good confidence, check for duplicates and save it
        if (analysis.isSubscription && analysis.confidence > 0.6) {
          console.log(`SCAN-DEBUG: Detected subscription: ${analysis.serviceName} (${analysis.confidence} confidence)`);
          
          // Check if this subscription already exists
          const subscriptionId1 = `${analysis.serviceName?.toLowerCase()}-${analysis.serviceProvider?.toLowerCase()}`;
          const subscriptionId2 = `email-${message.id || message}`;
          
          const isDuplicate = existingSubscriptionIds.has(subscriptionId1) || existingSubscriptionIds.has(subscriptionId2);
          
          if (isDuplicate) {
            console.log(`SCAN-DEBUG: Subscription ${analysis.serviceName} already exists, skipping`);
          } else {
            console.log(`SCAN-DEBUG: New subscription detected, saving: ${analysis.serviceName}`);
            try {
              await saveSubscription(userId, analysis);
              subscriptionsFound++;
            } catch (saveError) {
              console.error(`SCAN-DEBUG: Error saving subscription ${analysis.serviceName}:`, saveError);
              console.error(`SCAN-DEBUG: Save error stack:`, saveError.stack);
              // Continue processing other emails even if this subscription fails to save
            }
            
            // Add to existing subscription IDs to prevent duplicates in this scan
            if (subscriptionId1) existingSubscriptionIds.add(subscriptionId1);
            if (subscriptionId2) existingSubscriptionIds.add(subscriptionId2);
          }
        }
        
        processedCount++;
        console.log(`SCAN-DEBUG: Successfully processed email ${i + 1}/${emails.length}`);
        
      } catch (emailError) {
        console.error(`SCAN-DEBUG: Error processing email ${i + 1}:`, emailError);
        console.error(`SCAN-DEBUG: Error stack:`, emailError.stack);
        // Continue with next email instead of failing completely
        continue;
      }
    }

    console.log('SCAN-DEBUG: Email processing loop completed');
    
    // Get total subscription count (existing + new)
    const { data: totalSubscriptions, error: totalSubsError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId);
    
    const totalSubscriptionCount = totalSubscriptions?.length || 0;
    console.log(`SCAN-DEBUG: Total subscriptions for user: ${totalSubscriptionCount} (existing + new)`);
    
    // Update final status to ready_for_analysis so Gemini can process it
    console.log('SCAN-DEBUG: Setting scan status to ready_for_analysis');
    await updateScanStatus(scanId, userId, {
      status: 'ready_for_analysis',
      progress: 100,
      emails_processed: processedCount,
      subscriptions_found: totalSubscriptionCount,
      completed_at: new Date().toISOString()
    });
            
    console.log(`SCAN-DEBUG: Email processing completed for scan ${scanId}`);
    console.log(`SCAN-DEBUG: Total emails processed: ${processedCount}`);
    console.log(`SCAN-DEBUG: Subscriptions found: ${subscriptionsFound}`);
    console.log(`SCAN-DEBUG: Scan status set to 'ready_for_analysis' - Gemini Edge Function will process this scan`);

  } catch (error) {
    console.error('SCAN-DEBUG: Error in processEmails:', error);
    console.error('SCAN-DEBUG: Error stack:', error.stack);
    await updateScanStatus(scanId, userId, {
      status: 'error',
      error: error.message,
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
    console.log('SCAN-DEBUG: About to start processEmails in background');
    console.log('SCAN-DEBUG: Gmail token available:', !!gmailToken);
    console.log('SCAN-DEBUG: Scan ID:', scanId);
    console.log('SCAN-DEBUG: Database User ID:', dbUserId);
    
    try {
      console.log('SCAN-DEBUG: Starting processEmails...');
      processEmails(gmailToken, scanId, dbUserId).catch(error => {
        console.error('SCAN-DEBUG: Error processing emails:', error);
        console.error('SCAN-DEBUG: Error stack:', error.stack);
        updateScanStatus(scanId, dbUserId, {
          status: 'error',
          error: error.message,
          progress: 0
        }).catch(console.error);
      });
      console.log('SCAN-DEBUG: processEmails started successfully');
    } catch (error) {
      console.error('SCAN-DEBUG: Error starting processEmails:', error);
      console.error('SCAN-DEBUG: Error stack:', error.stack);
    }

    console.log('SCAN-DEBUG: Returning success response');
    return res.status(200).json({
      success: true,
      scanId,
      message: 'Scan started successfully'
    });

  } catch (error) {
    console.error('SCAN-DEBUG: Error in email scan handler:', error);
    console.error('SCAN-DEBUG: Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}