import fetch from 'node-fetch';

const API_BASE = 'https://api.quits.cc';

async function triggerTestScan() {
  console.log('=== TRIGGERING TEST SCAN (MOCK MODE) ===');
  
  try {
    // Step 1: Trigger a new scan in mock mode
    console.log('\n1. Triggering new scan in mock mode...');
    
    const scanResponse = await fetch(`${API_BASE}/api/email-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token_for_debugging',
        'X-Gmail-Token': 'test_gmail_token_for_debugging',
        'X-Mock-Mode': 'true'
      },
      body: JSON.stringify({})
    });
    
    console.log('Scan response status:', scanResponse.status);
    
    if (scanResponse.ok) {
      const scanData = await scanResponse.json();
      console.log('Scan response:', scanData);
      
      if (scanData.scanId) {
        console.log(`\n2. Monitoring scan progress for: ${scanData.scanId}`);
        
        // Monitor the scan for up to 2 minutes
        for (let i = 0; i < 24; i++) { // 24 * 5 seconds = 2 minutes
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          
          try {
            const statusResponse = await fetch(`${API_BASE}/api/scan-status/${scanData.scanId}`, {
              headers: {
                'Authorization': 'Bearer test_token_for_debugging'
              }
            });
            
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              console.log(`Progress check ${i + 1}: ${statusData.status} (${statusData.progress}%) - ${statusData.stats?.emails_found || 0} emails found, ${statusData.stats?.emails_processed || 0} processed`);
              
              if (statusData.status === 'completed' || statusData.status === 'failed' || statusData.status === 'error') {
                console.log('Scan finished with status:', statusData.status);
                if (statusData.error_message) {
                  console.log('Error message:', statusData.error_message);
                }
                break;
              }
            } else {
              console.log(`Status check ${i + 1} failed:`, statusResponse.status);
            }
          } catch (statusError) {
            console.log(`Status check ${i + 1} error:`, statusError.message);
          }
        }
      }
    } else {
      const errorText = await scanResponse.text();
      console.error('Scan failed:', errorText);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  console.log('\n=== TEST COMPLETE ===');
}

// Run the test
triggerTestScan(); 