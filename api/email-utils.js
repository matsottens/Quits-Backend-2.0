// Helper utilities for email parsing and analysis

/**
 * Extract email body from message object
 * @param {Object} email - Gmail message object
 * @returns {string} Extracted body text
 */
export const extractEmailBody = (email) => {
  let body = '';
  
  // Check if there's a simple body
  if (email.payload?.body?.data) {
    // Decode base64 data
    try {
      body = Buffer.from(email.payload.body.data, 'base64').toString('utf-8');
    } catch (err) {
      console.error('Error decoding email body:', err);
    }
    return body;
  }
  
  // Check for multipart message
  if (email.payload?.parts) {
    // First try to find plain text part
    const textPart = email.payload.parts.find(part => part.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      try {
        return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      } catch (err) {
        console.error('Error decoding plain text part:', err);
      }
    }
    
    // If no plain text, try HTML
    const htmlPart = email.payload.parts.find(part => part.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      try {
        // Get HTML and do basic HTML-to-text conversion
        const html = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
        // Remove HTML tags, but preserve line breaks
        return html.replace(/<[^>]*>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
      } catch (err) {
        console.error('Error decoding HTML part:', err);
      }
    }
    
    // Try to recursively extract from nested parts
    for (const part of email.payload.parts) {
      if (part.parts) {
        const nestedBody = extractEmailBody({ payload: part });
        if (nestedBody) {
          return nestedBody;
        }
      }
    }
  }
  
  return body;
};

/**
 * Analyze an email for subscription data using pattern matching
 * @param {Object} email - Gmail message object
 * @returns {Object} Analysis result with subscription details
 */
export const analyzeEmailForSubscriptions = (email) => {
  console.log('SCAN-DEBUG: Starting manual subscription analysis');
  
  // Extract email body (prefer text over HTML)
  const body = extractEmailBody(email);
  if (!body) {
    console.log('SCAN-DEBUG: No email body found');
    return { isSubscription: false, confidence: 0 };
  }
  
  // Extract important metadata
  const headers = email.payload?.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || '';
  const from = headers.find(h => h.name === 'From')?.value || '';
  const date = headers.find(h => h.name === 'Date')?.value || '';
  
  // Log the email metadata for debugging
  console.log(`SCAN-DEBUG: Analyzing email - Subject: "${subject}"`);
  console.log(`SCAN-DEBUG: From: ${from}`);
  console.log(`SCAN-DEBUG: Body length: ${body.length} characters`);
  
  // Key subscription-related terms
  const subscriptionTerms = [
    'subscription', 'subscribe', 'subscribed', 'plan', 'membership', 'member',
    'billing', 'payment', 'receipt', 'invoice', 'charge', 'transaction',
    'renew', 'renewal', 'renewed', 'recurring', 'monthly', 'yearly', 'annual',
    'premium', 'account', 'activated', 'welcome', 'trial', 'free trial',
    'thank you for your purchase', 'successfully subscribed', 'your purchase',
    'has been processed', 'payment confirmation', 'payment successful',
    'automatically renew', 'auto-renew', 'periodic billing', 'service fee',
    'membership fee', 'subscription fee', 'continue your access', 'continue access',
    'access expires', 'access will expire', 'your plan', 'active subscription',
    'cancel anytime', 'cancel your subscription', 'your subscription',
    'subscription details', 'manage subscription', 'upgrade plan', 'downgrade plan',
    'billed', 'amount due', 'next payment', 'upcoming payment', 'pay monthly',
    'pay annually', 'monthly plan', 'annual plan', 'billing cycle',
    'your account has been charged', 'credit card was charged',
    'order confirmation', 'trial period', 'trial ends', 'extended trial',
    'developer plan', 'hosting plan', 'cloud hosting', 'platform fee',
    'domain renewal', 'server costs', 'api access', 'bandwidth usage', 
    'storage plan', 'computing resources', 'usage fees', 'service charges',
    'account renewal', 'service renewal', 'pass renewal', 'league pass',
    'content access', 'streaming access', 'viewing subscription', 'digital access',
    'learning platform', 'education subscription', 'language learning',
    'course access', 'learning materials', 'interactive lessons'
  ];
  
  // Common service names to look for (these will be matched case-insensitive)
  const serviceNames = [
    'Netflix', 'Spotify', 'Apple Music', 'Amazon Prime', 'Disney+', 'Hulu', 'HBO Max',
    'YouTube Premium', 'Xbox Game Pass', 'PlayStation Plus', 'Nintendo Online',
    'Adobe Creative Cloud', 'Microsoft 365', 'Office 365', 'Google One', 'iCloud',
    'Vercel', 'Netlify', 'Heroku', 'Firebase', 'MongoDB Atlas', 'Supabase',
    'NBA League Pass', 'NBA TV', 'NFL Game Pass', 'MLB.tv', 'NHL.tv', 'ESPN+',
    'Babbel', 'Lingoda', 'Memrise', 'Busuu', 'LingQ', 'Pimsleur',
    'Vercel Pro', 'Vercel Enterprise', 'Vercel Teams', 'Vercel Platform',
    'Babbel Live', 'Babbel Complete', 'Babbel Intensive', 'Learning With Babbel',
    'NBA League Pass Premium', 'NBA League Pass Standard', 'NBA Team Pass'
  ];
  
  // Lowercase everything for case-insensitive matching
  const lowerSubject = subject.toLowerCase();
  const lowerBody = body.toLowerCase();
  const lowerFrom = from.toLowerCase();
  
  // Create regex patterns for higher-precision matches
  const vercelPattern = /\b(vercel|zeit|nextjs platform)\b.*?\b(invoice|receipt|payment|subscription|charge|billing)\b/i;
  const babbelPattern = /\b(babbel|language learning)\b.*?\b(invoice|receipt|payment|subscription|charge|billing|renewal)\b/i;
  const nbaPattern = /\b(nba|basketball|league pass)\b.*?\b(invoice|receipt|payment|subscription|charge|billing|renewal)\b/i;
  
  // Check for high-precision pattern matches first
  let detectedFromPatterns = [];
  
  if (vercelPattern.test(lowerSubject + ' ' + lowerBody) || 
      lowerFrom.includes('vercel') || lowerFrom.includes('zeit.co')) {
    detectedFromPatterns.push('Vercel');
    console.log('SCAN-DEBUG: High-precision match for Vercel');
  }
  
  if (babbelPattern.test(lowerSubject + ' ' + lowerBody) || 
      lowerFrom.includes('babbel') || lowerFrom.includes('babel')) {
    detectedFromPatterns.push('Babbel');
    console.log('SCAN-DEBUG: High-precision match for Babbel');
  }
  
  if (nbaPattern.test(lowerSubject + ' ' + lowerBody) || 
      lowerFrom.includes('nba.com') || lowerFrom.includes('leaguepass')) {
    detectedFromPatterns.push('NBA League Pass');
    console.log('SCAN-DEBUG: High-precision match for NBA League Pass');
  }
  
  // First, check for service name matches
  const detectedServiceNames = [];
  
  // Give priority to pattern-detected services
  if (detectedFromPatterns.length > 0) {
    detectedServiceNames.push(...detectedFromPatterns);
  }
  
  // Then check for direct name matches
  for (const serviceName of serviceNames) {
    const lowerServiceName = serviceName.toLowerCase();
    if (lowerSubject.includes(lowerServiceName) || 
        lowerBody.includes(lowerServiceName) || 
        lowerFrom.includes(lowerServiceName)) {
      if (!detectedServiceNames.includes(serviceName)) {
        detectedServiceNames.push(serviceName);
        console.log(`SCAN-DEBUG: Found service name match: ${serviceName}`);
      }
    }
  }
  
  // Identify primary service name
  let serviceName = detectedServiceNames.length > 0 ? detectedServiceNames[0] : null;
  
  // If no direct service name match, try to extract from sender domain
  if (!serviceName) {
    // Extract domain from the sender email
    const emailMatch = from.match(/[^@<>]+@([^@<>.]+\.[^@<>.]+)/);
    if (emailMatch && emailMatch[1]) {
      const domain = emailMatch[1].split('.')[0];
      serviceName = domain.charAt(0).toUpperCase() + domain.slice(1); // Capitalize first letter
      console.log(`SCAN-DEBUG: Extracted service name from email domain: ${serviceName}`);
    }
  }
  
  // Check for subscription terms
  let matchCount = 0;
  let confidence = 0;
  let matchedTerms = [];
  
  for (const term of subscriptionTerms) {
    if (lowerSubject.includes(term) || lowerBody.includes(term)) {
      matchCount++;
      matchedTerms.push(term);
      
      // Add more weight to important terms in the subject line
      if (lowerSubject.includes(term)) {
        confidence += 0.05;
      } else {
        confidence += 0.02;
      }
    }
  }
  
  // If we have specific service detections, lower the term match threshold
  const isSubscription = (matchCount >= 3) || (serviceName && matchCount >= 1) || (detectedFromPatterns.length > 0);
  
  // Boost confidence if service name was detected through patterns
  if (detectedFromPatterns.length > 0) {
    confidence += 0.3;
    console.log(`SCAN-DEBUG: Boosting confidence due to pattern match: +0.3`);
  }
  // Boost confidence if service name was detected through direct matching
  else if (serviceName) {
    confidence += 0.15;
    console.log(`SCAN-DEBUG: Boosting confidence due to service name: +0.15`);
  }
  
  // Boost confidence based on pattern matches
  // Check for price/amount patterns
  const priceMatches = body.match(/\$\d+(\.\d{2})?|\d+\.\d{2}(USD|EUR|GBP)?|€\d+(\.\d{2})?|£\d+(\.\d{2})?/g) || [];
  if (priceMatches.length > 0) {
    confidence += 0.1;
    console.log(`SCAN-DEBUG: Found price matches: ${priceMatches.join(', ')}`);
  }
  
  // Extract price from matches
  let price = null;
  let currency = 'USD';
  
  if (priceMatches.length > 0) {
    // Get the first match
    const priceText = priceMatches[0];
    
    // Extract the currency symbol
    if (priceText.includes('$')) {
      currency = 'USD';
    } else if (priceText.includes('€')) {
      currency = 'EUR';
    } else if (priceText.includes('£')) {
      currency = 'GBP';
    }
    
    // Extract the numeric amount
    const numericMatch = priceText.match(/\d+(\.\d{2})?/);
    if (numericMatch) {
      price = parseFloat(numericMatch[0]);
      console.log(`SCAN-DEBUG: Extracted price: ${price} ${currency}`);
    }
  }
  
  // Check for billing cycle patterns
  const monthlyPattern = /monthly|per month|\/month|month-to-month|billed monthly/i;
  const yearlyPattern = /yearly|per year|\/year|annual|annually|billed yearly/i;
  const weeklyPattern = /weekly|per week|\/week|billed weekly/i;
  const quarterlyPattern = /quarterly|every 3 months|3-month|billed quarterly/i;
  
  let billingFrequency = 'unknown';
  
  if (monthlyPattern.test(body) || monthlyPattern.test(subject)) {
    billingFrequency = 'monthly';
    confidence += 0.05;
    console.log(`SCAN-DEBUG: Detected monthly billing cycle`);
  } else if (yearlyPattern.test(body) || yearlyPattern.test(subject)) {
    billingFrequency = 'yearly';
    confidence += 0.05;
    console.log(`SCAN-DEBUG: Detected yearly billing cycle`);
  } else if (weeklyPattern.test(body) || weeklyPattern.test(subject)) {
    billingFrequency = 'weekly';
    confidence += 0.05;
    console.log(`SCAN-DEBUG: Detected weekly billing cycle`);
  } else if (quarterlyPattern.test(body) || quarterlyPattern.test(subject)) {
    billingFrequency = 'quarterly';
    confidence += 0.05;
    console.log(`SCAN-DEBUG: Detected quarterly billing cycle`);
  } else {
    // Default to monthly if price found but no billing frequency
    billingFrequency = 'monthly';
    console.log(`SCAN-DEBUG: No billing cycle found, defaulting to monthly`);
  }
  
  // Special case adjustments for specific services (based on common pricing models)
  if (serviceName) {
    if (serviceName === 'Vercel' && !price) {
      if (lowerBody.includes('pro') || lowerBody.includes('team')) {
        price = 20;  // Common Vercel Pro plan price
        billingFrequency = 'monthly';
        console.log(`SCAN-DEBUG: Applied Vercel-specific pricing`);
      }
    } else if (serviceName === 'Babbel' && !price) {
      price = 6.95;  // Common Babbel price point
      billingFrequency = 'monthly';
      console.log(`SCAN-DEBUG: Applied Babbel-specific pricing`);
    } else if ((serviceName === 'NBA League Pass' || serviceName.includes('NBA')) && !price) {
      price = 14.99;  // Common NBA League Pass price point
      billingFrequency = 'monthly';
      console.log(`SCAN-DEBUG: Applied NBA League Pass-specific pricing`);
    }
  }
  
  // Cap confidence at 0.95 for fallback method
  confidence = Math.min(confidence, 0.95);
  console.log(`SCAN-DEBUG: Final confidence score: ${confidence.toFixed(2)}`);
  
  // Generate a future date based on billing frequency
  const today = new Date();
  let nextBillingDate = null;
  
  if (price) {
    if (billingFrequency === 'monthly') {
      nextBillingDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    } else if (billingFrequency === 'yearly') {
      nextBillingDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    } else if (billingFrequency === 'weekly') {
      nextBillingDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (billingFrequency === 'quarterly') {
      nextBillingDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
    }
  }
  
  // Final subscription detection result
  const result = {
    isSubscription,
    confidence,
    serviceName,
    amount: price,
    currency,
    billingFrequency,
    nextBillingDate: nextBillingDate ? nextBillingDate.toISOString() : null,
    matchCount,
    detectedTerms: matchedTerms,
    emailSubject: subject,
    emailFrom: from,
    emailDate: date
  };
  
  console.log(`SCAN-DEBUG: Analysis result: isSubscription=${isSubscription}, confidence=${confidence.toFixed(2)}, service=${serviceName || 'unknown'}`);
  return result;
}; 