// Test script for trigger-gemini-scan endpoint
const API_URL = 'https://api.quits.cc';

async function testTriggerEndpoint() {
  console.log('Testing trigger-gemini-scan endpoint...');
  
  try {
    // Test POST request (frontend style)
    console.log('\n1. Testing POST request...');
    const postResponse = await fetch(`${API_URL}/api/trigger-gemini-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ scan_id: 'test-scan-id' })
    });
    
    console.log('POST Response status:', postResponse.status);
    console.log('POST Response headers:', Object.fromEntries(postResponse.headers.entries()));
    
    if (postResponse.ok) {
      const postData = await postResponse.json();
      console.log('POST Response data:', postData);
    } else {
      const errorText = await postResponse.text();
      console.log('POST Error:', errorText);
    }
    
    // Test GET request (cron job style)
    console.log('\n2. Testing GET request...');
    const getResponse = await fetch(`${API_URL}/api/trigger-gemini-scan`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('GET Response status:', getResponse.status);
    console.log('GET Response headers:', Object.fromEntries(getResponse.headers.entries()));
    
    if (getResponse.ok) {
      const getData = await getResponse.json();
      console.log('GET Response data:', getData);
    } else {
      const errorText = await getResponse.text();
      console.log('GET Error:', errorText);
    }
    
    // Test OPTIONS request (preflight)
    console.log('\n3. Testing OPTIONS request...');
    const optionsResponse = await fetch(`${API_URL}/api/trigger-gemini-scan`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://www.quits.cc',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    console.log('OPTIONS Response status:', optionsResponse.status);
    console.log('OPTIONS Response headers:', Object.fromEntries(optionsResponse.headers.entries()));
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testTriggerEndpoint(); 