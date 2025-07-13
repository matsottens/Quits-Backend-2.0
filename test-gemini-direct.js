// Direct test of Gemini API with a known subscription email
import fetch from 'node-fetch';

async function testGeminiDirect() {
  console.log('=== DIRECT GEMINI API TEST ===');
  
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not found in environment');
    return;
  }
  
  // Test with a known subscription email
  const testEmails = [
    {
      id: "test1",
      subject: "Your Netflix subscription",
      sender: "Netflix <no-reply@netflix.com>",
      content: "Thank you for your Netflix subscription payment of $15.99. Your next billing date is December 15, 2024. You can manage your subscription anytime in your account settings."
    },
    {
      id: "test2", 
      subject: "Spotify Premium - Payment Confirmation",
      sender: "Spotify <billing@spotify.com>",
      content: "Your Spotify Premium subscription has been renewed. Amount: $9.99 USD. Next billing date: January 10, 2025. Thank you for being a Premium member!"
    }
  ];
  
  const emailList = testEmails.map((email, index) => 
    `EMAIL ${index + 1}:
Subject: ${email.subject}
From: ${email.sender}
Content: ${email.content}`
  ).join('\n\n');

  const prompt = `Analyze these emails for subscription services. Look for:
- Recurring payments
- Billing notices
- Subscription confirmations
- Service renewals
- Payment receipts

For each email, return a JSON object with these exact fields:
{
  "is_subscription": true/false,
  "subscription_name": "service name or null",
  "price": number or null,
  "currency": "USD/EUR/etc or null",
  "billing_cycle": "monthly/yearly/weekly or null",
  "next_billing_date": "YYYY-MM-DD or null",
  "service_provider": "company name or null",
  "confidence_score": number between 0.0 and 1.0
}

Return a JSON array with one object per email in the same order. For non-subscriptions, set is_subscription to false and confidence_score to 0.95.

Emails to analyze:
${emailList}

Return ONLY the JSON array, no other text:`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { 
      response_mime_type: "application/json",
      temperature: 0.1,
      maxOutputTokens: 3000
    }
  };

  try {
    console.log('Sending test emails to Gemini...');
    console.log('Prompt:', prompt.substring(0, 500) + '...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    console.log('Raw Gemini response:', text);
    
    if (!text) {
      console.error('No response text from Gemini');
      return;
    }

    // Try to extract JSON array from the response
    let jsonText = text.trim();
    
    // Remove any markdown formatting
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.substring(7);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.substring(0, jsonText.length - 3);
    }
    
    // Find JSON array
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in response');
      return;
    }
    
    const results = JSON.parse(jsonMatch[0]);
    console.log('Parsed results:', JSON.stringify(results, null, 2));
    
    // Validate results
    if (Array.isArray(results) && results.length === testEmails.length) {
      console.log('✅ SUCCESS: Gemini API is working correctly!');
      console.log(`Found ${results.filter(r => r.is_subscription).length} subscriptions out of ${results.length} emails`);
      
      results.forEach((result, index) => {
        console.log(`Email ${index + 1}: ${result.is_subscription ? 'SUBSCRIPTION' : 'NOT SUBSCRIPTION'}`);
        if (result.is_subscription) {
          console.log(`  - Service: ${result.subscription_name}`);
          console.log(`  - Price: ${result.price} ${result.currency}`);
          console.log(`  - Billing: ${result.billing_cycle}`);
          console.log(`  - Next billing: ${result.next_billing_date}`);
          console.log(`  - Confidence: ${result.confidence_score}`);
        }
      });
    } else {
      console.error('❌ FAILED: Unexpected response format');
    }
    
  } catch (error) {
    console.error('Error testing Gemini API:', error);
  }
}

testGeminiDirect(); 