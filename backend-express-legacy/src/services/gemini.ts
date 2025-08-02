import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import dotenv from 'dotenv';

dotenv.config();

const geminiApiKey = process.env.GEMINI_API_KEY;
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_PROJECT_ID;
const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION;

let useMockImplementation = false;

if (!geminiApiKey) {
  console.warn('Missing Gemini API key (GEMINI_API_KEY) in environment variables. Will attempt to use real API anyway.');
  // Only set to true if we absolutely cannot initialize the API
}

if (!projectId || !location) {
  console.warn('Missing Google Cloud Project ID or Location for Vertex AI. Will attempt to use real API anyway.');
  // Only set to true if we absolutely cannot initialize the API
}

let vertex_ai: VertexAI | null = null;
try {
  vertex_ai = new VertexAI({ 
    project: projectId || 'quits-2-0', 
    location: location || 'us-central1' 
  });
  console.log('Successfully initialized Vertex AI client');
} catch (error) {
  console.error('Failed to initialize Vertex AI:', error);
  useMockImplementation = true;
}

const model = 'gemini-1.5-flash-001'; 

const generativeModel = vertex_ai && !useMockImplementation
  ? vertex_ai.getGenerativeModel({
      model: model,
      // The following parameters are optional
      // They are added here for demonstration purposes
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
      generationConfig: { maxOutputTokens: 8192, temperature: 1, topP: 0.95 },
    })
  : null;

interface SubscriptionAnalysis {
  isSubscription: boolean;
  serviceName?: string;
  subscriptionType?: string;
  amount?: number;           // Used for price
  price?: number;            // Alternative field name
  currency?: string;
  billingFrequency?: string; // Used for billing_frequency
  billingCycle?: string;     // Alternative field name
  nextBillingDate?: string;
  confidence?: number;
  error?: string;
  rawOutput?: string;        // For debugging
  details?: string;          // For error details
}

/**
 * Summarize email content and extract subscription details
 * @param rawEmailContent The raw email content to summarize
 * @returns The structured summary with subscription details
 */
export async function summarizeEmail(rawEmailContent: string): Promise<SubscriptionAnalysis> {
  // Only use mock implementation if specified AND we failed to initialize the API
  if (useMockImplementation && !generativeModel) {
    console.log('Using mock implementation for Gemini API - real API unavailable');
    return mockAnalyzeEmail(rawEmailContent);
  }

  if (!generativeModel) {
    console.error('Gemini model not initialized. Cannot summarize email.');
    return { isSubscription: false, error: 'Gemini service not available' };
  }

  const prompt = `
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
    ${rawEmailContent}
    --- END EMAIL CONTENT ---
    
    JSON Output:
  `;

  try {
    const req = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    const streamingResp = await generativeModel.generateContentStream(req);
    
    // Aggregate the response text
    let aggregatedResponseText = '';
    for await (const item of streamingResp.stream) {
      if (item.candidates && item.candidates[0].content?.parts) {
          const partText = item.candidates[0].content.parts[0].text;
          if (partText) {
             aggregatedResponseText += partText;
          }
      }
    }
    
    // Attempt to parse the aggregated JSON string
    try {
        const cleanedJsonString = aggregatedResponseText
          .replace(/^\s*```json\s*/, '') // Remove leading ```json
          .replace(/\s*```\s*$/, ''); // Remove trailing ```
        
        const result = JSON.parse(cleanedJsonString);
        return result;
    } catch (parseError) {
        console.error('Failed to parse Gemini JSON response:', parseError);
        console.error('Raw Gemini Response Text:', aggregatedResponseText); 
        return { isSubscription: false, error: 'Failed to parse analysis result', rawOutput: aggregatedResponseText };
    }

  } catch (error: any) {
    console.error('Error calling Gemini API:', error);
    return { isSubscription: false, error: 'Failed to analyze email', details: error.message };
  }
}

/**
 * Mock implementation for email analysis when Gemini API is not available
 * This provides realistic-looking results for development and testing
 */
function mockAnalyzeEmail(content: string): SubscriptionAnalysis {
  // Simple keyword-based detection
  const lowerContent = content.toLowerCase();
  
  // Check if this looks like a subscription email
  const subscriptionKeywords = ['subscription', 'billing', 'payment', 'renew', 'monthly', 'yearly', 'annual'];
  const isSubscription = subscriptionKeywords.some(keyword => lowerContent.includes(keyword));
  
  if (!isSubscription) {
    return { 
      isSubscription: false,
      confidence: 0.95
    };
  }
  
  // Try to extract service name (simple heuristic)
  let serviceName = 'Unknown Service';
  
  // Common subscription services to check for
  const services = [
    'Netflix', 'Amazon', 'Prime', 'Spotify', 'Apple', 'Disney', 'Hulu', 'HBO', 
    'YouTube', 'Adobe', 'Microsoft', 'Google', 'Dropbox', 'iCloud', 'Slack',
    'Zoom', 'GitHub', 'Notion', 'Figma'
  ];
  
  for (const service of services) {
    if (content.includes(service)) {
      serviceName = service;
      break;
    }
  }
  
  // Try to extract price
  let price = 0;
  const priceRegex = /\$(\d+(\.\d{2})?)/;
  const priceMatch = content.match(priceRegex);
  if (priceMatch && priceMatch[1]) {
    price = parseFloat(priceMatch[1]);
  }
  
  // Determine billing frequency
  let billingFrequency = 'monthly';
  if (lowerContent.includes('year') || lowerContent.includes('annual')) {
    billingFrequency = 'yearly';
  } else if (lowerContent.includes('week')) {
    billingFrequency = 'weekly';
  }
  
  // Mock next billing date (today + 1 month)
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);
  const nextBillingDate = nextDate.toISOString().split('T')[0];
  
  return {
    isSubscription: true,
    serviceName,
    amount: price,
    currency: 'USD',
    billingFrequency,
    nextBillingDate,
    confidence: 0.8
  };
} 