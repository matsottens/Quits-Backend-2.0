// Simple script to fix stuck scan using existing API endpoints
import fetch from 'node-fetch';

async function fixStuckScan() {
  console.log('Fixing stuck scan...');
  
  try {
    // First, let's check the current scan status using the scan-status endpoint
    const scanId = 'scan_azfqsjxc34';
    
    console.log(`Checking status of scan ${scanId}...`);
    
    // Since we can't access the database directly, let's try to trigger the analysis again
    console.log('Triggering Gemini analysis again...');
    
    const triggerResponse = await fetch('https://api.quits.cc/api/trigger-gemini-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Trigger response status:', triggerResponse.status);
    
    if (triggerResponse.ok) {
      const triggerData = await triggerResponse.json();
      console.log('Trigger response:', triggerData);
    } else {
      const errorText = await triggerResponse.text();
      console.error('Trigger error:', errorText);
    }
    
    // Wait a moment and check the scan status again
    console.log('Waiting 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse = await fetch(`https://api.quits.cc/api/scan-status/${scanId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log('Updated scan status:', statusData);
    } else {
      console.error('Failed to get updated status:', statusResponse.status);
    }
    
  } catch (error) {
    console.error('Error fixing stuck scan:', error);
  }
}

fixStuckScan(); 