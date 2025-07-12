// Test script to manually trigger the Gemini Edge Function
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testEdgeFunction() {
  try {
    console.log('Testing Gemini Edge Function...');
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/gemini-scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    
    console.log('Edge Function response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Edge Function response:', data);
    } else {
      const errorText = await response.text();
      console.error('Edge Function error:', errorText);
    }
  } catch (error) {
    console.error('Error testing Edge Function:', error);
  }
}

// Also test the trigger endpoint
async function testTriggerEndpoint() {
  try {
    console.log('\nTesting trigger endpoint...');
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/trigger-gemini-scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    
    console.log('Trigger endpoint response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Trigger endpoint response:', data);
    } else {
      const errorText = await response.text();
      console.error('Trigger endpoint error:', errorText);
    }
  } catch (error) {
    console.error('Error testing trigger endpoint:', error);
  }
}

// Run both tests
async function runTests() {
  await testEdgeFunction();
  await testTriggerEndpoint();
}

runTests(); 