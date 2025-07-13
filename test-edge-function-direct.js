// Direct test of the Edge Function to see what's happening
import fetch from 'node-fetch';

async function testEdgeFunction() {
  console.log('Testing Edge Function directly...');
  
  try {
    const scanId = 'scan_azfqsjxc34';
    const userId = 'b41495b7-ee65-4e9d-a621-6a7c014b7d33';
    
    console.log(`Testing Edge Function for scan: ${scanId}, user: ${userId}`);
    
    // Call the Edge Function directly
    const edgeFunctionResponse = await fetch(
      "https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan",
      { 
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          scan_ids: [scanId],
          user_ids: [userId]
        })
      }
    );
    
    console.log('Edge Function response status:', edgeFunctionResponse.status);
    console.log('Edge Function response headers:', Object.fromEntries(edgeFunctionResponse.headers.entries()));
    
    if (!edgeFunctionResponse.ok) {
      const errorText = await edgeFunctionResponse.text();
      console.error('Edge Function error:', errorText);
      return;
    }
    
    const responseData = await edgeFunctionResponse.json();
    console.log('Edge Function response data:', responseData);
    
    // Wait a moment and check the scan status
    console.log('Waiting 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check scan status
    const statusResponse = await fetch(`https://api.quits.cc/api/scan-status/${scanId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log('Updated scan status:', statusData);
    }
    
  } catch (error) {
    console.error('Error testing Edge Function:', error);
  }
}

testEdgeFunction(); 