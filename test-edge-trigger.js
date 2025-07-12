// Test Edge Function trigger
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

async function testEdgeTrigger() {
  try {
    console.log('Testing Edge Function trigger...');
    console.log('Service role key available:', !!SUPABASE_SERVICE_ROLE_KEY);
    
    // First, check if there are any scans ready for analysis
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?status=eq.ready_for_analysis&select=*&limit=5`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (scanResponse.ok) {
      const scans = await scanResponse.json();
      console.log(`Found ${scans.length} scans ready for analysis`);
      scans.forEach(scan => {
        console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%)`);
      });
    }
    
    // Now trigger the Edge Function
    console.log('\nTriggering Edge Function...');
    const triggerResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/gemini-scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    
    console.log('Trigger response status:', triggerResponse.status);
    if (triggerResponse.ok) {
      const triggerData = await triggerResponse.json();
      console.log('Trigger response:', triggerData);
    } else {
      const errorText = await triggerResponse.text();
      console.error('Trigger error:', errorText);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testEdgeTrigger(); 