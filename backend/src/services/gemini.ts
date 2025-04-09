import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import dotenv from 'dotenv';

dotenv.config();

const geminiApiKey = process.env.GEMINI_API_KEY;
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_PROJECT_ID;
const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION;

if (!geminiApiKey) {
  console.warn('Missing Gemini API key (GEMINI_API_KEY) in environment variables. Gemini features will be disabled.');
  // Optionally throw error if Gemini is critical
  // throw new Error('Missing Gemini API key in environment variables'); 
}

if (!projectId || !location) {
  throw new Error('Missing Google Cloud Project ID or Location for Vertex AI');
}

let vertex_ai: VertexAI | null = null;
if (geminiApiKey) { // Only initialize if API key exists
    vertex_ai = new VertexAI({ project: projectId, location: location });
}

const model = 'gemini-1.5-flash-001'; 

const generativeModel = vertex_ai
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
  amount?: number;
  currency?: string;
  billingFrequency?: string;
  nextBillingDate?: string;
  confidence?: number;
  error?: string;
}

/**
 * Summarize email content and extract subscription details
 * @param rawEmailContent The raw email content to summarize
 * @returns The structured summary with subscription details
 */
export async function summarizeEmail(rawEmailContent: string): Promise<SubscriptionAnalysis> {
  if (!generativeModel) {
    console.error('Gemini model not initialized. Cannot summarize email.');
    return { isSubscription: false, error: 'Gemini service not available' };
  }

  const prompt = `
    Analyze the following email content to determine if it relates to a subscription service.
    If it is a subscription, extract the following details: service name, price (amount and currency), billing frequency (e.g., monthly, yearly), and the next billing date (if available). 
    Format the output as a JSON object.
    If the email is not about a subscription, return a JSON object with "isSubscription": false.
    
    JSON Output Structure for Subscription:
    {
      "isSubscription": true,
      "serviceName": "Example Service",
      "price": 10.99,
      "currency": "USD",
      "billingFrequency": "monthly", 
      "nextBillingDate": "YYYY-MM-DD" // or null if not found
    }
    
    JSON Output Structure for Non-Subscription:
    {
      "isSubscription": false
    }
    
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