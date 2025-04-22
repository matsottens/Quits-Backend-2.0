// Test script for debug-scan.js
import debugScanHandler from './api/debug-scan.js';

// Create mock request and response objects
const mockRequest = {
  method: 'GET',
  headers: {
    authorization: 'Bearer fake_token_for_testing'
  },
  query: {
    scanId: 'test_scan_id'
  }
};

const mockResponse = {
  setHeader: (name, value) => {
    console.log(`Setting header: ${name} = ${value}`);
  },
  status: (code) => {
    console.log(`Setting status code: ${code}`);
    return mockResponse;
  },
  json: (data) => {
    console.log('Response data:', JSON.stringify(data, null, 2));
    return mockResponse;
  },
  end: () => {
    console.log('Response ended');
    return mockResponse;
  }
};

console.log('Running debug-scan handler test...');

// Replace the jwt verify function to skip token verification
import jsonwebtoken from 'jsonwebtoken';
const originalVerify = jsonwebtoken.verify;
jsonwebtoken.verify = (token, secret) => {
  console.log('Mock token verification');
  return {
    id: 'test_user_id',
    email: 'test@example.com'
  };
};

// Run the handler
async function runTest() {
  try {
    await debugScanHandler(mockRequest, mockResponse);
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Restore original verify function
    jsonwebtoken.verify = originalVerify;
  }
}

runTest(); 