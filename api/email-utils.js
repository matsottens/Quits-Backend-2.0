// Helper utilities for email parsing and analysis
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Extracts the text body from an email message
 * @param {Object} message - The Gmail message object
 * @returns {string} The extracted text content
 */
function extractEmailBody(message) {
  console.log("SCAN-DEBUG: Extracting email body...");
  
  if (!message || !message.payload) {
    console.log("SCAN-DEBUG: Invalid message format - missing payload");
    return '';
  }

  // Try to get text from the message
  let body = '';
  const mimeType = message.payload.mimeType;
  console.log(`SCAN-DEBUG: Message MIME type: ${mimeType}`);

  if (mimeType === 'text/plain') {
    // For plain text emails
    if (message.payload.body && message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }
  } else if (mimeType === 'text/html') {
    // For HTML emails
    if (message.payload.body && message.payload.body.data) {
      const htmlBody = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      // Use cheerio to extract text from HTML
      const $ = cheerio.load(htmlBody);
      body = $('body').text();
    }
  } else if (mimeType === 'multipart/alternative' || mimeType === 'multipart/mixed' || mimeType === 'multipart/related') {
    // For multipart emails, try to find text/plain or text/html parts
    if (message.payload.parts) {
      console.log(`SCAN-DEBUG: Found ${message.payload.parts.length} parts in the email`);
      
      // First try to find a text/plain part
      let plainTextPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
      
      // If no text/plain, look for text/html
      let htmlPart = message.payload.parts.find(part => part.mimeType === 'text/html');
      
      if (plainTextPart && plainTextPart.body && plainTextPart.body.data) {
        body = Buffer.from(plainTextPart.body.data, 'base64').toString('utf-8');
        console.log("SCAN-DEBUG: Using plain text part for body");
      } else if (htmlPart && htmlPart.body && htmlPart.body.data) {
        const htmlBody = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
        const $ = cheerio.load(htmlBody);
        body = $('body').text();
        console.log("SCAN-DEBUG: Using HTML part for body");
      } else {
        // Recursively search for parts within parts
        const findTextRecursively = (parts) => {
          for (const part of parts) {
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
              return Buffer.from(part.body.data, 'base64').toString('utf-8');
            } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
              const htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
              const $ = cheerio.load(htmlBody);
              return $('body').text();
            } else if (part.parts) {
              const nestedResult = findTextRecursively(part.parts);
              if (nestedResult) return nestedResult;
            }
          }
          return null;
        };
        
        const recursiveResult = findTextRecursively(message.payload.parts);
        if (recursiveResult) {
          body = recursiveResult;
          console.log("SCAN-DEBUG: Found text in nested parts");
        }
      }
    }
  }

  // If we couldn't extract the body by standard means, try a more aggressive approach
  if (!body) {
    console.log("SCAN-DEBUG: Standard extraction failed, using fallback method");
    body = extractTextFromNestedStructure(message.payload);
  }

  console.log(`SCAN-DEBUG: Email body extract length: ${body.length} characters`);
  return body;
}

/**
 * Fallback method to extract text from a nested message structure
 * @param {Object} part - A part of the email message
 * @returns {string} The extracted text
 */
function extractTextFromNestedStructure(part) {
  if (!part) return '';
  
  let text = '';
  
  // Extract from the current part's body if it exists
  if (part.body && part.body.data) {
    try {
      // For text parts, decode and add to the result
      const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
      if (part.mimeType === 'text/html') {
        const $ = cheerio.load(decoded);
        text += $('body').text();
      } else {
        text += decoded;
      }
    } catch (e) {
      console.log(`SCAN-DEBUG: Error decoding part: ${e.message}`);
    }
  }
  
  // Recursively process any child parts
  if (part.parts && Array.isArray(part.parts)) {
    for (const childPart of part.parts) {
      text += extractTextFromNestedStructure(childPart);
    }
  }
  
  return text;
}

/**
 * Analyzes an email to detect if it's a subscription or receipt
 * This is a fallback method when the Gemini API is not available or fails
 * @param {Object} emailData - The email data including headers and body
 * @returns {Object} Analysis result with subscription details
 */
function analyzeEmailForSubscriptions(emailData) {
  console.log("SCAN-DEBUG: Analyzing email for subscriptions using pattern matching...");
  
  const { subject, from, body } = emailData;
  let confidence = 0;
  let isSubscription = false;
  let serviceName = null;
  let amount = null;
  let currency = null;
  let billingFrequency = null;
  let nextBillingDate = null;

  // Normalize the text to lowercase for easier pattern matching
  const normalizedBody = body.toLowerCase();
  const normalizedSubject = subject ? subject.toLowerCase() : '';
  const normalizedFrom = from ? from.toLowerCase() : '';

  // Keywords that indicate a subscription email
  const subscriptionKeywords = [
    'subscription', 'subscribed', 'your plan', 'monthly plan', 'annual plan',
    'membership', 'billing', 'payment', 'receipt', 'invoice', 'charge',
    'renewal', 'renewed', 'will renew', 'has been renewed', 'auto-renewal',
    'recurring', 'billed', 'paid', 'successfully charged',
    'thank you for your payment', 'payment confirmation',
    'premium', 'pro plan', 'plus plan', 'upgraded', 'upgrade'
  ];

  // Check subject line for subscription-related keywords
  subscriptionKeywords.forEach(keyword => {
    if (normalizedSubject.includes(keyword)) {
      confidence += 20;
      console.log(`SCAN-DEBUG: Found subscription keyword "${keyword}" in subject (confidence +20)`);
    }
  });

  // Check email body for subscription-related keywords
  subscriptionKeywords.forEach(keyword => {
    if (normalizedBody.includes(keyword)) {
      confidence += 10;
      console.log(`SCAN-DEBUG: Found subscription keyword "${keyword}" in body (confidence +10)`);
    }
  });

  // Check for currency symbols and amounts
  const currencyPatterns = [
    { pattern: /\$\s*(\d+(?:\.\d{2})?)/, currency: 'USD' },
    { pattern: /€\s*(\d+(?:,\d{2})?)/, currency: 'EUR' },
    { pattern: /£\s*(\d+(?:\.\d{2})?)/, currency: 'GBP' },
    { pattern: /(\d+(?:\.\d{2})?)\s*USD/, currency: 'USD' },
    { pattern: /(\d+(?:,\d{2})?)\s*EUR/, currency: 'EUR' },
    { pattern: /(\d+(?:\.\d{2})?)\s*GBP/, currency: 'GBP' }
  ];

  for (const { pattern, currency: currencyCode } of currencyPatterns) {
    const matches = body.match(pattern);
    if (matches && matches[1]) {
      amount = parseFloat(matches[1].replace(',', '.'));
      currency = currencyCode;
      confidence += 15;
      console.log(`SCAN-DEBUG: Found currency pattern ${currencyCode} ${amount} (confidence +15)`);
      break;
    }
  }

  // Try to detect the service name from common patterns
  const serviceNamePatterns = [
    /thank you for subscribing to ([\w\s]+)/i,
    /your ([\w\s]+) subscription/i,
    /your ([\w\s]+) membership/i,
    /your ([\w\s]+) plan/i,
    /billing for ([\w\s]+)/i,
    /payment to ([\w\s]+)/i,
    /receipt from ([\w\s]+)/i,
    /invoice from ([\w\s]+)/i
  ];

  // First try to extract from the body
  for (const pattern of serviceNamePatterns) {
    const matches = body.match(pattern);
    if (matches && matches[1]) {
      serviceName = matches[1].trim();
      confidence += 10;
      console.log(`SCAN-DEBUG: Found service name "${serviceName}" from body pattern (confidence +10)`);
      break;
    }
  }

  // If no service name found in body, try to extract from the sender
  if (!serviceName && from) {
    // Extract domain from email
    const domainMatch = from.match(/@([\w.-]+)/);
    if (domainMatch && domainMatch[1]) {
      // Extract the domain name without the TLD
      const domain = domainMatch[1].split('.')[0];
      if (domain && domain.length > 1 && !['gmail', 'yahoo', 'hotmail', 'outlook', 'mail'].includes(domain)) {
        serviceName = domain.charAt(0).toUpperCase() + domain.slice(1);
        confidence += 5;
        console.log(`SCAN-DEBUG: Derived service name "${serviceName}" from sender domain (confidence +5)`);
      }
    }
  }

  // If still no service name, use part of the subject line
  if (!serviceName && subject) {
    const words = subject.split(/\s+/).filter(word => 
      word.length > 3 && 
      !['your', 'subscription', 'receipt', 'invoice', 'payment', 'confirmation', 'billing'].includes(word.toLowerCase())
    );
    
    if (words.length > 0) {
      serviceName = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      confidence += 3;
      console.log(`SCAN-DEBUG: Used subject word "${serviceName}" as fallback service name (confidence +3)`);
    }
  }

  // Detect billing frequency
  const billingPatterns = [
    { pattern: /monthly|per month|\/month|\/ month|month to month/i, frequency: 'monthly' },
    { pattern: /yearly|per year|annual|\/year|\/ year/i, frequency: 'yearly' },
    { pattern: /quarterly|per quarter|every 3 months|every three months/i, frequency: 'quarterly' },
    { pattern: /weekly|per week|every week|\/week|\/ week/i, frequency: 'weekly' },
    { pattern: /bi-weekly|every 2 weeks|every two weeks/i, frequency: 'bi-weekly' },
    { pattern: /semi-annual|every 6 months|every six months/i, frequency: 'semi-annual' }
  ];

  for (const { pattern, frequency } of billingPatterns) {
    if (pattern.test(normalizedBody) || pattern.test(normalizedSubject)) {
      billingFrequency = frequency;
      confidence += 10;
      console.log(`SCAN-DEBUG: Detected billing frequency "${frequency}" (confidence +10)`);
      break;
    }
  }

  // Generate the next billing date based on the current date and billing frequency
  if (billingFrequency) {
    const today = new Date();
    switch (billingFrequency) {
      case 'monthly':
        today.setMonth(today.getMonth() + 1);
        break;
      case 'yearly':
        today.setFullYear(today.getFullYear() + 1);
        break;
      case 'quarterly':
        today.setMonth(today.getMonth() + 3);
        break;
      case 'weekly':
        today.setDate(today.getDate() + 7);
        break;
      case 'bi-weekly':
        today.setDate(today.getDate() + 14);
        break;
      case 'semi-annual':
        today.setMonth(today.getMonth() + 6);
        break;
    }
    nextBillingDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  // Determine if this is likely a subscription based on confidence score
  isSubscription = confidence >= 40;
  console.log(`SCAN-DEBUG: Final confidence score: ${confidence}, subscription: ${isSubscription}`);

  return {
    isSubscription,
    serviceName: serviceName || 'Unknown Service',
    amount: amount,
    currency: currency,
    billingFrequency: billingFrequency || 'unknown',
    nextBillingDate: nextBillingDate,
    confidence: confidence
  };
}

/**
 * Parse email headers to extract subject and from fields
 * @param {Array} headers - Email headers array
 * @returns {Object} Object containing subject, from, and date fields
 */
function parseEmailHeaders(headers) {
  if (!headers || !Array.isArray(headers)) {
    return { subject: '', from: '', date: '' };
  }

  let subject = '';
  let from = '';
  let date = '';

  for (const header of headers) {
    if (header.name === 'Subject') {
      subject = header.value;
    } else if (header.name === 'From') {
      from = header.value;
    } else if (header.name === 'Date') {
      date = header.value;
    }
  }

  return { subject, from, date };
}

module.exports = {
  extractEmailBody,
  analyzeEmailForSubscriptions,
  parseEmailHeaders
}; 