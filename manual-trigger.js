// Manual trigger script to test the Edge Function
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdHNsdWZsd3h6a3dvdXhjamtoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTY5NzI5NywiZXhwIjoyMDQ3Mjc1Mjk3fQ.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

async function manualTrigger() {
  try {
    console.log('Manually triggering Edge Function...');
    
    // First, let's check what scans exist
    console.log('Checking existing scans...');
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?select=*&order=created_at.desc&limit=5`,
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
      
      if (scans.length > 0) {
        const latestScan = scans[0];
        console.log(`\nUpdating scan ${latestScan.scan_id} to ready_for_analysis...`);
        
        // Update the scan status
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
        } else {
          const errorText = await updateResponse.text();
          console.error('Failed to update scan:', errorText);
        }
      }
    } else {
      const errorText = await scanResponse.text();
      console.error('Failed to fetch scans:', errorText);
    }
    
  } catch (error) {
    console.error('Error in manual trigger:', error);
  }
}

manualTrigger(); 