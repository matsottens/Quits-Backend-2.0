// Debug endpoint to test Gemini API
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    console.log('GEMINI-DEBUG: Testing Gemini AI API directly');
    
    // Log environment variables for debugging
    console.log('GEMINI-DEBUG: Environment variables:');
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`VERCEL_ENV: ${process.env.VERCEL_ENV}`);
    console.log(`GEMINI_API_KEY exists: ${!!process.env.GEMINI_API_KEY}`);
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'gemini_api_key_missing',
        message: 'GEMINI_API_KEY environment variable is not set',
        availableKeys: Object.keys(process.env).filter(key => key.includes('API') || key.includes('KEY')).join(', ')
      });
    }
    
    // Sample email content
    const sampleEmail = {
      from: "Netflix <info@netflix.com>",
      subject: "Your Netflix subscription has been renewed",
      date: "2023-04-15",
      body: `
Dear Customer,

We're confirming that your Netflix subscription has been renewed.

Your account was charged $15.99 for the Standard plan.
Your next billing date will be May 15, 2023.

If you have any questions about your account, please visit our Help Center.

Thanks for being a Netflix member!

The Netflix Team
      `
    };
    
    // Format the complete email
    const formattedEmail = `
From: ${sampleEmail.from}
Subject: ${sampleEmail.subject}
Date: ${sampleEmail.date}

${sampleEmail.body}
    `;

    // Create the prompt
    const prompt = `
You are a specialized AI system designed to analyze emails and identify subscription services with high accuracy.

Your task is to determine if the email contains information about a subscription service, especially:
1. Subscription confirmations
2. Renewal notices
3. Payment receipts for recurring services
4. Subscription-based products or services

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
    
    console.log('GEMINI-DEBUG: Calling Gemini API');
    console.log(`GEMINI-DEBUG: Using API key starting with: ${process.env.GEMINI_API_KEY.substring(0, 5)}...`);
    
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
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('GEMINI-DEBUG: API error:', errorData);
      return res.status(500).json({ 
        error: 'gemini_api_error',
        message: `Gemini API error: ${response.status} ${response.statusText}`,
        details: errorData
      });
    }
    
    const data = await response.json();
    console.log('GEMINI-DEBUG: Received response from Gemini API');
    
    // Extract text from response
    const geminiText = data.candidates[0].content.parts[0].text;
    
    // Extract JSON from text
    const jsonMatch = geminiText.match(/\{[\s\S]*\}/);
    let result;
    
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[0]);
        console.log('GEMINI-DEBUG: Successfully parsed JSON response');
      } catch (parseError) {
        console.error('GEMINI-DEBUG: Error parsing response JSON:', parseError);
        console.error('GEMINI-DEBUG: Raw response:', geminiText);
        
        return res.status(500).json({
          error: 'parse_error',
          message: 'Failed to parse Gemini API response',
          rawResponse: geminiText
        });
      }
    } else {
      console.warn('GEMINI-DEBUG: Unexpected response format');
      return res.status(500).json({
        error: 'unexpected_format',
        message: 'Unexpected Gemini API response format',
        rawResponse: geminiText
      });
    }
    
    // Return the results
    return res.status(200).json({
      success: true,
      message: 'Gemini API test successful',
      prompt: prompt,
      rawResponse: geminiText,
      parsedResult: result
    });
    
  } catch (error) {
    console.error('GEMINI-DEBUG: Error testing Gemini AI:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred testing Gemini AI',
      details: error.message
    });
  }
} 