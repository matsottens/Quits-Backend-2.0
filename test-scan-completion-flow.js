// Test script to verify scan completion flow
import fetch from 'node-fetch';

const API_URL = 'https://api.quits.cc';

async function testScanCompletionFlow() {
  console.log('🧪 Testing scan completion flow...');
  
  try {
    // Step 1: Start a new scan
    console.log('\n1. Starting new scan...');
    const startResponse = await fetch(`${API_URL}/api/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token_for_debugging'
      }
    });
    
    if (!startResponse.ok) {
      console.error('Failed to start scan:', startResponse.status);
      return;
    }
    
    const startData = await startResponse.json();
    const scanId = startData.scanId;
    console.log('✅ Scan started with ID:', scanId);
    
    // Step 2: Monitor scan progress
    console.log('\n2. Monitoring scan progress...');
    let completed = false;
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max
    
    while (!completed && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      try {
        const statusResponse = await fetch(`${API_URL}/api/scan-status/${scanId}`, {
          headers: {
            'Authorization': 'Bearer test_token_for_debugging'
          }
        });
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log(`Progress check ${attempts}: ${statusData.status} (${statusData.progress}%)`);
          
          if (statusData.status === 'completed') {
            console.log('✅ Scan completed successfully!');
            completed = true;
            break;
          } else if (statusData.status === 'error' || statusData.status === 'failed') {
            console.log('❌ Scan failed with status:', statusData.status);
            break;
          }
        } else {
          console.log(`Status check ${attempts} failed:`, statusResponse.status);
        }
      } catch (error) {
        console.log(`Status check ${attempts} error:`, error.message);
      }
    }
    
    if (!completed) {
      console.log('⚠️ Scan did not complete within expected time');
    }
    
    // Step 3: Test that no new scans are started when checking status
    console.log('\n3. Testing that no new scans are started when checking status...');
    
    // Check status multiple times to see if new scans are triggered
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      try {
        const checkResponse = await fetch(`${API_URL}/api/scan-status/latest`, {
          headers: {
            'Authorization': 'Bearer test_token_for_debugging'
          }
        });
        
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          console.log(`Status check ${i + 1}: ${checkData.status} (${checkData.scan_id})`);
          
          if (checkData.scan_id !== scanId) {
            console.log('⚠️ Different scan ID returned - new scan may have been started');
          } else {
            console.log('✅ Same scan ID returned - no new scan started');
          }
        }
      } catch (error) {
        console.log(`Check ${i + 1} error:`, error.message);
      }
    }
    
    console.log('\n🎉 Test completed!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testScanCompletionFlow(); 