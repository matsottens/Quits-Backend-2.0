// Check and fix scan status so Edge Function can process it
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkAndFixScanStatus() {
  console.log('Checking and fixing scan status...');
  
  try {
    const scanId = 'scan_azfqsjxc34';
    
    // First, check the current scan status
    console.log('1. Checking current scan status...');
    
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scanId}&select=*`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!scanResponse.ok) {
      console.error('Failed to fetch scan:', scanResponse.status);
      return;
    }
    
    const scans = await scanResponse.json();
    if (scans.length === 0) {
      console.error('Scan not found');
      return;
    }
    
    const scan = scans[0];
    console.log('Current scan status:', scan.status);
    console.log('Current scan progress:', scan.progress);
    console.log('Subscriptions found:', scan.subscriptions_found);
    
    // Check if there are pending analysis records
    console.log('2. Checking pending analysis records...');
    
    const analysisResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${scanId}&analysis_status=eq.pending&select=*`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (analysisResponse.ok) {
      const pendingAnalysis = await analysisResponse.json();
      console.log(`Found ${pendingAnalysis.length} pending analysis records`);
      
      if (pendingAnalysis.length > 0) {
        console.log('3. Fixing scan status to ready_for_analysis...');
        
        // Update scan status to ready_for_analysis so Edge Function can process it
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
              status: 'ready_for_analysis',
              updated_at: new Date().toISOString()
            })
          }
        );
        
        if (updateResponse.ok) {
          console.log('✅ Successfully updated scan status to ready_for_analysis');
          
          // Now trigger the Edge Function
          console.log('4. Triggering Edge Function...');
          
          const triggerResponse = await fetch(
            "https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan",
            { 
              method: "POST",
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_KEY}`
              },
              body: JSON.stringify({
                scan_ids: [scanId],
                user_ids: [scan.user_id]
              })
            }
          );
          
          console.log('Edge Function response status:', triggerResponse.status);
          
          if (triggerResponse.ok) {
            const triggerData = await triggerResponse.json();
            console.log('Edge Function response:', triggerData);
            
            // Wait and check status again
            console.log('5. Waiting 30 seconds for Edge Function to complete...');
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            const finalScanResponse = await fetch(
              `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scanId}&select=*`,
              {
                method: 'GET',
                headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': `Bearer ${SUPABASE_KEY}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            if (finalScanResponse.ok) {
              const finalScans = await finalScanResponse.json();
              const finalScan = finalScans[0];
              console.log('Final scan status:', finalScan.status);
              console.log('Final scan progress:', finalScan.progress);
              
              if (finalScan.status === 'completed') {
                console.log('✅ Edge Function completed successfully!');
              } else if (finalScan.status === 'analyzing') {
                console.log('⚠️ Edge Function is still running...');
              } else {
                console.log('❌ Edge Function may have failed');
              }
            }
          } else {
            const errorText = await triggerResponse.text();
            console.error('Edge Function error:', errorText);
          }
        } else {
          console.error('Failed to update scan status');
        }
      } else {
        console.log('No pending analysis records found');
      }
    }
    
  } catch (error) {
    console.error('Error checking and fixing scan status:', error);
  }
}

checkAndFixScanStatus(); 