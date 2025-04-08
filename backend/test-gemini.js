import { summarizeEmail } from './dist/services/gemini.js';

// Sample email content for testing
const sampleEmail = `
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
`;

async function testGemini() {
  try {
    console.log('Testing Gemini service with sample email...');
    const result = await summarizeEmail(sampleEmail);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error testing Gemini service:', error);
  }
}

testGemini(); 