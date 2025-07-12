// Test Gmail token validation
import fetch from 'node-fetch';

// This is a simple test to check if Gmail API calls work
async function testGmailValidation() {
  try {
    console.log('=== GMAIL VALIDATION TEST ===\n');
    
    // Test with a dummy token to see what error we get
    const dummyToken = 'dummy_token_for_testing';
    
    console.log('1. Testing with dummy token...');
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        Authorization: `Bearer ${dummyToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`Response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
    }
    
    console.log('\n2. Testing Gmail API endpoint availability...');
    const healthResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      method: 'OPTIONS'
    });
    
    console.log(`Health check status: ${healthResponse.status}`);
    console.log('Gmail API endpoint is reachable');
    
    console.log('\n=== TEST COMPLETE ===');
    console.log('If you see 401 errors with dummy token, the Gmail API is working correctly.');
    console.log('The issue is likely with the actual Gmail token or permissions.');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testGmailValidation(); 