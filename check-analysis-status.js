// Script to check analysis status and manually complete stuck scans
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkAnalysisStatus() {
  console.log('Checking analysis status...');
  
  try {
    // Check for scans stuck in 'analyzing' status
    const analyzingScansResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?status=eq.analyzing&select=*`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!analyzingScansResponse.ok) {
      console.error('Failed to fetch analyzing scans:', analyzingScansResponse.status);
      return;
    }
    
    const analyzingScans = await analyzingScansResponse.json();
    console.log(`Found ${analyzingScans.length} scans stuck in 'analyzing' status:`);
    
    for (const scan of analyzingScans) {
      console.log(`- Scan ${scan.scan_id}: ${scan.subscriptions_found} subscriptions found`);
      
      // Check pending analysis records for this scan
      const pendingAnalysisResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${scan.scan_id}&analysis_status=eq.pending&select=*`,
        {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (pendingAnalysisResponse.ok) {
        const pendingAnalysis = await pendingAnalysisResponse.json();
        console.log(`  - ${pendingAnalysis.length} pending analysis records`);
        
        // Check if any analysis records have been completed
        const completedAnalysisResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${scan.scan_id}&analysis_status=eq.completed&select=*`,
          {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (completedAnalysisResponse.ok) {
          const completedAnalysis = await completedAnalysisResponse.json();
          console.log(`  - ${completedAnalysis.length} completed analysis records`);
          
          // If we have completed analysis records, mark the scan as completed
          if (completedAnalysis.length > 0) {
            console.log(`  - Marking scan ${scan.scan_id} as completed...`);
            
            const updateResponse = await fetch(
              `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scan.scan_id}`,
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
            
            if (updateResponse.ok) {
              console.log(`  - Successfully marked scan ${scan.scan_id} as completed`);
            } else {
              console.error(`  - Failed to mark scan ${scan.scan_id} as completed:`, updateResponse.status);
            }
          }
        }
      }
    }
    
    // Also check for scans in 'ready_for_analysis' status
    const readyScansResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?status=eq.ready_for_analysis&select=*`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (readyScansResponse.ok) {
      const readyScans = await readyScansResponse.json();
      console.log(`\nFound ${readyScans.length} scans ready for analysis:`);
      
      for (const scan of readyScans) {
        console.log(`- Scan ${scan.scan_id}: ${scan.subscriptions_found} subscriptions found`);
      }
    }
    
  } catch (error) {
    console.error('Error checking analysis status:', error);
  }
}

checkAnalysisStatus(); 