import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.GOOGLE_CLOUD_PROJECT) {
  throw new Error('Missing GOOGLE_CLOUD_PROJECT in environment variables');
}

if (!process.env.GOOGLE_CLOUD_LOCATION) {
  throw new Error('Missing GOOGLE_CLOUD_LOCATION in environment variables');
}

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY in environment variables');
}

// Initialize Vertex AI with project and location
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION,
  apiEndpoint: 'us-central1-aiplatform.googleapis.com',
  credentials: {
    client_email: process.env.GEMINI_API_KEY,
  }
});

// Get the model
const model = vertexAI.preview.getGenerativeModel({
  model: 'gemini-pro',
});

interface SubscriptionAnalysis {
  isSubscription: boolean;
  serviceName?: string;
  subscriptionType?: string;
  amount?: number;
  currency?: string;
  billingFrequency?: string;
  nextBillingDate?: string;
  confidence?: number;
  error?: string;
}

/**
 * Summarize email content and extract subscription details
 * @param emailContent The raw email content to summarize
 * @returns The structured summary with subscription details
 */
export async function summarizeEmail(emailContent: string): Promise<SubscriptionAnalysis> {
  try {
    const prompt = `
      Analyze the following email content and extract subscription details.
      Focus on identifying recurring payments, subscriptions, memberships, or services.
      
      Rules:
      1. Look for key indicators like "subscription", "recurring payment", "membership", "billing", etc.
      2. Extract specific amounts, currencies, and billing frequencies.
      3. Try to find the next billing date if mentioned.
      4. Assign a confidence score (0-1) based on how certain you are this is a subscription.
      5. If you're not sure it's a subscription, set isSubscription to false.
      
      Email content:
      ${emailContent}
      
      Return a JSON object with these fields:
      {
        "isSubscription": boolean,
        "serviceName": string (name of the service/company),
        "subscriptionType": string (e.g., "streaming", "software", "membership"),
        "amount": number (just the number, no currency),
        "currency": string (e.g., "USD", "EUR"),
        "billingFrequency": string (e.g., "monthly", "yearly"),
        "nextBillingDate": string (YYYY-MM-DD format if found),
        "confidence": number (0-1),
        "error": string (if not a subscription or error occurred)
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    
    try {
      const parsed = JSON.parse(text);
      return {
        isSubscription: Boolean(parsed.isSubscription),
        serviceName: parsed.serviceName,
        subscriptionType: parsed.subscriptionType,
        amount: typeof parsed.amount === 'number' ? parsed.amount : parseFloat(parsed.amount),
        currency: parsed.currency,
        billingFrequency: parsed.billingFrequency,
        nextBillingDate: parsed.nextBillingDate,
        confidence: parsed.confidence,
        error: parsed.error
      };
    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      return {
        isSubscription: false,
        error: 'Failed to parse subscription details'
      };
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      isSubscription: false,
      error: 'Failed to analyze email content'
    };
  }
} 