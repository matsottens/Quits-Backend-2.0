import { summarizeEmail } from './dist/services/gemini.js';
import dotenv from 'dotenv';

dotenv.config();

// Sample email content for testing
const sampleEmails = [
  // Netflix subscription
  {
    name: 'Netflix Subscription',
    content: `
Dear Customer,

Thank you for your subscription to Netflix Premium. Your monthly subscription of $19.99 will be charged on May 15, 2023.

Subscription Details:
- Plan: Premium (4K + HDR)
- Billing Cycle: Monthly
- Next Billing Date: May 15, 2023
- Payment Method: Visa ending in 1234

If you have any questions, please contact our customer support.

Best regards,
Netflix Team
    `
  },
  // Amazon Prime
  {
    name: 'Amazon Prime',
    content: `
Hello,

This email confirms your Amazon Prime membership renewal. Your annual membership fee of $139 will be charged on June 10, 2023.

Your Amazon Prime Benefits:
- Free Two-Day Shipping
- Prime Video
- Prime Music
- Prime Reading
- And more...

Thank you for being a valued Prime member!

Amazon Prime Team
    `
  },
  // Non-subscription email
  {
    name: 'Regular Email',
    content: `
Hi there,

I hope this email finds you well. I wanted to follow up on our discussion from last week about the project timeline.

Let me know if you need any clarification or have questions about the upcoming milestones.

Best regards,
John
    `
  }
];

async function testGemini() {
  try {
    console.log('==== Testing Gemini AI Service ====');
    console.log('Gemini API Key provided:', !!process.env.GEMINI_API_KEY);
    console.log('Project ID:', process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_PROJECT_ID);
    console.log('Location:', process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION);
    
    for (const sample of sampleEmails) {
      console.log(`\n--- Testing with ${sample.name} ---`);
      console.log(`Email length: ${sample.content.length} characters`);
      
      const startTime = Date.now();
      const result = await summarizeEmail(sample.content);
      const duration = Date.now() - startTime;
      
      console.log(`Analysis completed in ${duration}ms`);
      console.log('Result:', JSON.stringify(result, null, 2));
      
      if (result.isSubscription) {
        console.log('✅ Detected as a subscription');
      } else {
        console.log('❌ Not detected as a subscription');
      }
    }
  } catch (error) {
    console.error('Error testing Gemini service:', error);
  }
}

testGemini(); 