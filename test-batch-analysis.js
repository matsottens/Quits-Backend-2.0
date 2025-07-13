// Test script to debug batch analysis issue
import fetch from 'node-fetch';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Test emails that should be detected as subscriptions
const testEmails = [
  {
    id: "test1",
    content: "Your Netflix subscription has been renewed. You will be charged $15.99 on your next billing date.",
    subject: "Netflix Subscription Renewed",
    sender: "netflix@netflix.com"
  },
  {
    id: "test2", 
    content: "Your Spotify Premium subscription is active. Monthly charge: $9.99",
    subject: "Spotify Premium Active",
    sender: "spotify@spotify.com"
  }
];

async function testBatchAnalysis() {
  console.log('Testing batch analysis with sample emails...');
  
  const emailList = testEmails.map((email, index) => 
    `${index + 1}. Subject: ${email.subject}\nFrom: ${email.sender}\nContent: ${email.content}`
  ).join('\n\n');

  const prompt = `Analyze the following emails to identify subscription services. Be aggressive in finding subscription details. If you see any payment, service, or subscription information, extract it.

For each email, return a JSON object with:
- "is_subscription": boolean (true if any subscription info found)
- "subscription_name": string (extract the service/product name)
- "price": number (extract the amount, convert to number)
- "currency": string (USD, EUR, etc.)
- "billing_cycle": string (monthly, yearly, weekly, etc.)
- "next_billing_date": string (YYYY-MM-DD format if found)
- "service_provider": string (company name)
- "confidence_score": number (0.0 to 1.0 based on how clear the info is)

Return a JSON array with one object per email in the same order. For non-subscriptions, only include "is_subscription": false and "confidence_score": 0.95.

Emails to analyze:
${emailList}

Return only valid JSON array:`;

  console.log('Sending prompt to Gemini...');
  console.log('Prompt:', prompt);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { 
          response_mime_type: "application/json",
          temperature: 0.1,
          maxOutputTokens: 2000
        }
      })
    });

    if (!response.ok) {
      console.error('API Error:', response.status, await response.text());
      return;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    console.log('Raw response:', text);
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in response');
      return;
    }
    
    console.log('Found JSON array:', jsonMatch[0]);
    
    const results = JSON.parse(jsonMatch[0]);
    console.log('Parsed results:', JSON.stringify(results, null, 2));
    
    // Check if subscriptions were detected
    const subscriptions = results.filter(r => r.is_subscription);
    console.log(`Found ${subscriptions.length} subscriptions out of ${results.length} emails`);
    
    subscriptions.forEach((sub, i) => {
      console.log(`Subscription ${i + 1}: ${sub.subscription_name} - $${sub.price}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testBatchAnalysis(); 