// Trigger Edge Function for current scan
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function triggerCurrentScan() {
  try {
    console.log('Triggering Edge Function for current scan...');
    
    // First, let's check what scans exist
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?select=*&order=created_at.desc&limit=3`,
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
      console.log(`Found ${scans.length} scans:`);
      scans.forEach(scan => {
        console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%)`);
      });
      
      // Check subscription analysis records
      const analysisResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/subscription_analysis?select=*&order=created_at.desc&limit=5`,
        {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (analysisResponse.ok) {
        const analysis = await analysisResponse.json();
        console.log(`\nFound ${analysis.length} analysis records:`);
        analysis.forEach(item => {
          console.log(`- ${item.id}: ${item.subscription_name} (${item.analysis_status})`);
        });
      }
      
      // Update the latest scan to ready_for_analysis if it's not already
      if (scans.length > 0) {
        const latestScan = scans[0];
        if (latestScan.status !== 'ready_for_analysis') {
          console.log(`\nUpdating scan ${latestScan.scan_id} to ready_for_analysis...`);
          
          const updateResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${latestScan.scan_id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                status: 'ready_for_analysis',
                progress: 90,
                updated_at: new Date().toISOString()
              })
            }
          );
          
          if (updateResponse.ok) {
            console.log('Scan updated successfully');
          } else {
            const errorText = await updateResponse.text();
            console.error('Failed to update scan:', errorText);
          }
        }
      }
    }
    
    // Now trigger the Edge Function
    console.log('\nTriggering Edge Function...');
    const edgeResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/gemini-scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    
    console.log('Edge Function response status:', edgeResponse.status);
    if (edgeResponse.ok) {
      const edgeData = await edgeResponse.json();
      console.log('Edge Function response:', edgeData);
    } else {
      const errorText = await edgeResponse.text();
      console.error('Edge Function error:', errorText);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

triggerCurrentScan(); 