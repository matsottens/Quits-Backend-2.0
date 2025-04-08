import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Vertex AI with your Google Cloud project and location
const projectId = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('Missing Gemini API key in environment variables');
}

const vertexAI = new VertexAI({
  project: projectId,
  location,
  apiKey
});

// Access Gemini model
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-pro',
});

/**
 * Summarize email content and extract subscription details
 * @param emailContent The raw email content to summarize
 * @returns The structured summary with subscription details
 */
export async function summarizeEmail(emailContent: string): Promise<any> {
  try {
    // Truncate content if it's too long
    const truncatedContent = emailContent.slice(0, 10000);
    
    const prompt = `
      Analyze this email content and extract subscription details. If this is a subscription confirmation, receipt, welcome, or payment email, please extract the following information:
      
      Email content:
      """
      ${truncatedContent}
      """
      
      Return a JSON object with the following structure:
      {
        "isSubscription": boolean, // Is this a subscription email?
        "name": string, // Name of the subscription or service
        "price": number, // Price amount (numeric value only)
        "currency": string, // Currency code (e.g., "USD", "EUR", etc.)
        "billingCycle": string, // e.g., "monthly", "yearly", "weekly", etc.
        "nextBillingDate": string, // YYYY-MM-DD format if found
        "provider": string, // Company providing the service
        "category": string, // Category of subscription if identifiable (e.g., "entertainment", "productivity", etc.)
        "confidence": number // 0-1 confidence score
      }
      
      If the email is not related to a subscription, set isSubscription to false and leave other fields empty.
    `;
    
    const response = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    
    const responseText = response.response.candidates[0].content.parts[0].text;
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonString = jsonMatch[0];
      return JSON.parse(jsonString);
    }
    
    throw new Error('Failed to extract JSON from Gemini response');
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      isSubscription: false,
      confidence: 0,
      error: 'Failed to analyze email content'
    };
  }
} 