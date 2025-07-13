// Script to manually complete the stuck scan
// Since pattern matching has already detected subscriptions, we can complete the scan

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdHNsdWZsd3h6a3dvdXhjamtoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzE5NzI5MCwiZXhwIjoyMDUyNzczMjkwfQ.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

async function completeScanManually() {
  console.log('Manually completing stuck scan...');
  
  try {
    const scanId = 'scan_azfqsjxc34';
    
    // Update the scan status to completed
    console.log(`Updating scan ${scanId} to completed status...`);
    
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scanId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    );
    
    console.log('Update response status:', updateResponse.status);
    
    if (updateResponse.ok) {
      console.log('Successfully marked scan as completed!');
      
      // Also update any pending analysis records to completed
      console.log('Updating pending analysis records to completed...');
      
      const analysisUpdateResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${scanId}&analysis_status=eq.pending`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            analysis_status: 'completed',
            updated_at: new Date().toISOString()
          })
        }
      );
      
      console.log('Analysis update response status:', analysisUpdateResponse.status);
      
      if (analysisUpdateResponse.ok) {
        console.log('Successfully updated analysis records!');
      } else {
        console.error('Failed to update analysis records:', analysisUpdateResponse.status);
      }
      
    } else {
      const errorText = await updateResponse.text();
      console.error('Failed to update scan status:', errorText);
    }
    
  } catch (error) {
    console.error('Error completing scan manually:', error);
  }
}

completeScanManually(); 