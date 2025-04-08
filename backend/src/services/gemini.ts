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

/**
 * Summarize email content and extract subscription details
 * @param emailContent The raw email content to summarize
 * @returns The structured summary with subscription details
 */
export async function summarizeEmail(emailContent: string): Promise<any> {
  try {
    const prompt = `
      Analyze the following email content and extract subscription details.
      If the email is not related to a subscription, set isSubscription to false and return an error message.
      
      Email content:
      ${emailContent}
      
      Return a JSON object with the following fields:
      {
        "isSubscription": boolean,
        "serviceName": string,
        "subscriptionType": string,
        "amount": number,
        "currency": string,
        "billingFrequency": string,
        "nextBillingDate": string,
        "error": string (if not a subscription)
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    try {
      return JSON.parse(text);
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