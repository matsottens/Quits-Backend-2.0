// Comprehensive test of the Edge Function to verify subscription detection
import fetch from 'node-fetch';

async function testEdgeFunction() {
  console.log('=== COMPREHENSIVE EDGE FUNCTION TEST ===');
  
  try {
    const scanId = 'scan_azfqsjxc34';
    const userId = 'b41495b7-ee65-4e9d-a621-6a7c014b7d33';
    
    console.log(`\n1. Testing Edge Function for scan: ${scanId}, user: ${userId}`);
    
    // First, check the current state of the scan
    console.log('\n2. Checking current scan status...');
    const statusResponse = await fetch(`https://api.quits.cc/api/scan-status/${scanId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log('Current scan status:', statusData);
    }
    
    // Check subscription analysis records
    console.log('\n3. Checking subscription analysis records...');
    const analysisResponse = await fetch(`https://api.quits.cc/api/analyzed-subscriptions?scan_id=${scanId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (analysisResponse.ok) {
      const analysisData = await analysisResponse.json();
      console.log(`Found ${analysisData.length} subscription analysis records`);
      console.log('Analysis records:', analysisData.slice(0, 3)); // Show first 3
    }
    
    // Call the Edge Function directly
    console.log('\n4. Calling Edge Function...');
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
    
    if (!edgeFunctionResponse.ok) {
      const errorText = await edgeFunctionResponse.text();
      console.error('Edge Function error:', errorText);
      return;
    }
    
    const responseData = await edgeFunctionResponse.json();
    console.log('Edge Function response data:', responseData);
    
    // Wait for processing to complete
    console.log('\n5. Waiting 15 seconds for processing to complete...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Check updated scan status
    console.log('\n6. Checking updated scan status...');
    const updatedStatusResponse = await fetch(`https://api.quits.cc/api/scan-status/${scanId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (updatedStatusResponse.ok) {
      const updatedStatusData = await updatedStatusResponse.json();
      console.log('Updated scan status:', updatedStatusData);
    }
    
    // Check updated subscription analysis records
    console.log('\n7. Checking updated subscription analysis records...');
    const updatedAnalysisResponse = await fetch(`https://api.quits.cc/api/analyzed-subscriptions?scan_id=${scanId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (updatedAnalysisResponse.ok) {
      const updatedAnalysisData = await updatedAnalysisResponse.json();
      console.log(`Found ${updatedAnalysisData.length} updated subscription analysis records`);
      
      // Show completed analyses
      const completedAnalyses = updatedAnalysisData.filter(a => a.analysis_status === 'completed');
      console.log(`Completed analyses: ${completedAnalyses.length}`);
      
      if (completedAnalyses.length > 0) {
        console.log('Sample completed analysis:', completedAnalyses[0]);
      }
      
      // Show failed analyses
      const failedAnalyses = updatedAnalysisData.filter(a => a.analysis_status === 'failed');
      console.log(`Failed analyses: ${failedAnalyses.length}`);
      
      if (failedAnalyses.length > 0) {
        console.log('Sample failed analysis:', failedAnalyses[0]);
      }
    }
    
    // Check if subscriptions were created
    console.log('\n8. Checking if subscriptions were created...');
    const subscriptionsResponse = await fetch(`https://api.quits.cc/api/subscription?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (subscriptionsResponse.ok) {
      const subscriptionsData = await subscriptionsResponse.json();
      console.log(`Found ${subscriptionsData.length} total subscriptions for user`);
      
      if (subscriptionsData.length > 0) {
        console.log('Recent subscriptions:', subscriptionsData.slice(-5)); // Show last 5
      }
    }
    
    console.log('\n=== TEST COMPLETED ===');
    
  } catch (error) {
    console.error('Error during comprehensive test:', error);
  }
}

testEdgeFunction(); 