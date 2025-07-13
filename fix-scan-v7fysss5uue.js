// Fix the specific stuck scan scan_v7fysss5uue
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fixScanV7fysss5uue() {
  console.log('Fixing scan scan_v7fysss5uue...');
  
  try {
    const scanId = 'scan_v7fysss5uue';
    
    // From the logs, we know:
    // - scan has subscriptions_found: 5 (pattern matching worked!)
    // - status is 'analyzing' but Edge Function isn't processing it
    // - progress is 100 in database but frontend shows 90%
    // - updated_at is recent, so 10-minute timeout hasn't triggered
    
    console.log('✅ Pattern matching detected 5 subscriptions successfully!');
    console.log('✅ Scan is stuck in analyzing status but Edge Function not processing');
    console.log('✅ Resetting scan to ready_for_analysis so Edge Function can process it...');
    
    // Reset scan to ready_for_analysis
    const resetResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scanId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'ready_for_analysis',
          updated_at: new Date().toISOString()
        })
      }
    );
    
    if (resetResponse.ok) {
      console.log('✅ Successfully reset scan to ready_for_analysis!');
      
      // Now trigger the Edge Function
      console.log('Triggering Edge Function to process the scan...');
      
      const triggerResponse = await fetch('https://api.quits.cc/api/trigger-gemini-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (triggerResponse.ok) {
        const triggerData = await triggerResponse.json();
        console.log('Trigger response:', triggerData);
        
        if (triggerData.success && triggerData.scans_processed > 0) {
          console.log('✅ Edge Function triggered successfully!');
          console.log('✅ Scan should now complete properly');
        } else {
          console.log('⚠️ Edge Function trigger returned no scans processed');
        }
      } else {
        const errorText = await triggerResponse.text();
        console.error('Failed to trigger Edge Function:', errorText);
      }
      
    } else {
      const errorText = await resetResponse.text();
      console.error('Failed to reset scan:', errorText);
    }
    
  } catch (error) {
    console.error('Error fixing scan:', error);
  }
}

fixScanV7fysss5uue(); 