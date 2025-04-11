/**
 * Simple mock implementation for email analysis 
 * This provides realistic-looking results for development and testing
 */
function mockAnalyzeEmail(content) {
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

// Sample emails for testing
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

function testMockGemini() {
  console.log('==== Testing Mock Gemini Implementation ====');
  
  for (const sample of sampleEmails) {
    console.log(`\n--- Testing with ${sample.name} ---`);
    console.log(`Email length: ${sample.content.length} characters`);
    
    const startTime = performance.now();
    const result = mockAnalyzeEmail(sample.content);
    const duration = performance.now() - startTime;
    
    console.log(`Analysis completed in ${duration.toFixed(2)}ms`);
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.isSubscription) {
      console.log('✅ Detected as a subscription');
    } else {
      console.log('❌ Not detected as a subscription');
    }
  }
}

// Run the test
testMockGemini(); 