import fetch from 'node-fetch';

async function checkCurrentScan() {
  console.log('=== CHECKING CURRENT SCAN ===');
  
  try {
    // Check the most recent scan
    const response = await fetch('https://api.quits.cc/api/scan-status/latest', {
      headers: {
        'Authorization': 'Bearer test_token_for_debugging'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Current scan status:', JSON.stringify(data, null, 2));
    } else {
      console.log('Failed to get scan status:', response.status);
      const errorText = await response.text();
      console.log('Error:', errorText);
    }
    
  } catch (error) {
    console.error('Error checking scan:', error);
  }
}

checkCurrentScan(); 