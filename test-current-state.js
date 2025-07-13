// Test current state of scans and email processing
import fetch from 'node-fetch';

async function testCurrentState() {
  console.log('=== TESTING CURRENT STATE ===');
  
  try {
    // 1. Test the trigger endpoint
    console.log('\n1. Testing trigger endpoint...');
    const triggerResponse = await fetch('https://api.quits.cc/api/trigger-gemini-scan');
    const triggerData = await triggerResponse.json();
    console.log('Trigger response:', triggerData);
    
    // 2. Test scan status endpoint (this might require auth, but let's try)
    console.log('\n2. Testing scan status endpoint...');
    try {
      const statusResponse = await fetch('https://api.quits.cc/api/scan-status/test_scan');
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log('Scan status response:', statusData);
      } else {
        console.log('Scan status requires authentication');
      }
    } catch (error) {
      console.log('Scan status error:', error.message);
    }
    
    // 3. Test analyzed subscriptions endpoint
    console.log('\n3. Testing analyzed subscriptions endpoint...');
    try {
      const analysisResponse = await fetch('https://api.quits.cc/api/analyzed-subscriptions?scan_id=test_scan');
      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        console.log('Analysis response:', analysisData);
      } else {
        console.log('Analysis endpoint requires authentication');
      }
    } catch (error) {
      console.log('Analysis error:', error.message);
    }
    
    // 4. Test subscription endpoint
    console.log('\n4. Testing subscription endpoint...');
    try {
      const subscriptionResponse = await fetch('https://api.quits.cc/api/subscription?user_id=test_user');
      if (subscriptionResponse.ok) {
        const subscriptionData = await subscriptionResponse.json();
        console.log('Subscription response:', subscriptionData);
      } else {
        console.log('Subscription endpoint requires authentication');
      }
    } catch (error) {
      console.log('Subscription error:', error.message);
    }
    
    // 5. Test the Edge Function directly with a test payload
    console.log('\n5. Testing Edge Function directly...');
    try {
      const edgeResponse = await fetch(
        'https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            scan_ids: ['test_scan_123'],
            user_ids: ['test_user_123']
          })
        }
      );
      
      console.log('Edge Function status:', edgeResponse.status);
      if (edgeResponse.ok) {
        const edgeData = await edgeResponse.json();
        console.log('Edge Function response:', edgeData);
      } else {
        const errorText = await edgeResponse.text();
        console.log('Edge Function error:', errorText);
      }
    } catch (error) {
      console.log('Edge Function error:', error.message);
    }
    
    console.log('\n=== ANALYSIS ===');
    console.log('Based on the responses above:');
    console.log('1. The trigger endpoint is working but finds no scans ready for analysis');
    console.log('2. This suggests that scans are not reaching the "ready_for_analysis" status');
    console.log('3. The issue is likely in the email scan process, not the Edge Function');
    console.log('4. To test the Edge Function, we need to create a scan with "ready_for_analysis" status');
    
  } catch (error) {
    console.error('Error testing current state:', error);
  }
}

testCurrentState(); 