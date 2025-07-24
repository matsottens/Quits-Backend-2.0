// Test script to debug signup request
import https from 'https';

const testSignup = async () => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      email: 'debug-test@example.com',
      password: 'testpassword123',
      name: 'Debug Test User'
    });

    const options = {
      hostname: 'api.quits.cc',
      port: 443,
      path: '/api/auth/signup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Origin': 'https://www.quits.cc'
      }
    };

    console.log('Making signup request with data:', postData);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`Response status: ${res.statusCode}`);
        console.log(`Response headers:`, res.headers);
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
};

async function runTest() {
  console.log('Testing signup endpoint with debug logging...\n');

  try {
    const result = await testSignup();
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, result.data);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTest(); 