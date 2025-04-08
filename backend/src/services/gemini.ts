import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Get API key from environment variables
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('Missing Gemini API key in environment variables');
}

console.log('Initializing Gemini API with API key');

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(apiKey);

// Get the generative model
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

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
        "confidence": number, // 0-1 confidence score
        "summary": string // A brief 2-3 sentence summary of the email content
      }
      
      If the email is not related to a subscription, set isSubscription to false and leave other fields empty.
    `;
    
    console.log('Sending request to Gemini API...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('Received response from Gemini API');
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonString = jsonMatch[0];
      const result = JSON.parse(jsonString);
      console.log('Successfully parsed subscription data:', result);
      return result;
    }
    
    throw new Error('Failed to extract JSON from Gemini response');
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      isSubscription: false,
      confidence: 0,
      error: 'Failed to analyze email content',
      summary: 'Unable to process this email due to an error.'
    };
  }
} 