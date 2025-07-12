// Test script for email scanning functionality
import fetch from 'node-fetch';

// Test the email scanning endpoint directly
async function testEmailScan() {
  try {
    console.log('Testing email scanning endpoint...');
    
    // You'll need to replace this with a valid JWT token
    const token = process.env.TEST_TOKEN || 'your-jwt-token-here';
    
    if (token === 'your-jwt-token-here') {
      console.log('Please set TEST_TOKEN environment variable with a valid JWT token');
      return;
    }
    
    const response = await fetch('https://api.quits.cc/api/email-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        token: token,
        useRealData: true
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('Success response:', data);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testEmailScan(); 