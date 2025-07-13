// Script to manually trigger Edge Function analysis for a specific scan
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function manualTriggerAnalysis(scanId, userId) {
  console.log(`Manually triggering analysis for scan ${scanId} and user ${userId}...`);
  
  try {
    // First, check if the scan exists and get its details
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
      console.error('Failed to fetch scan details:', scanResponse.status);
      return;
    }
    
    const scans = await scanResponse.json();
    if (scans.length === 0) {
      console.error(`Scan ${scanId} not found`);
      return;
    }
    
    const scan = scans[0];
    console.log(`Found scan: ${scan.scan_id}, status: ${scan.status}, subscriptions: ${scan.subscriptions_found}`);
    
    // Check pending analysis records
    const pendingAnalysisResponse = await fetch(
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
    
    if (pendingAnalysisResponse.ok) {
      const pendingAnalysis = await pendingAnalysisResponse.json();
      console.log(`Found ${pendingAnalysis.length} pending analysis records`);
      
      if (pendingAnalysis.length === 0) {
        console.log('No pending analysis records found. Checking if analysis is already completed...');
        
        const completedAnalysisResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${scanId}&analysis_status=eq.completed&select=*`,
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
          console.log(`Found ${completedAnalysis.length} completed analysis records`);
          
          if (completedAnalysis.length > 0) {
            console.log('Analysis is already completed. Marking scan as completed...');
            
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
            
            if (updateResponse.ok) {
              console.log('Successfully marked scan as completed');
            } else {
              console.error('Failed to mark scan as completed:', updateResponse.status);
            }
            return;
          }
        }
      }
    }
    
    // If we have pending analysis records, trigger the Edge Function
    console.log('Triggering Edge Function for analysis...');
    
    const edgeFunctionResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/gemini-scan`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scan_ids: [scanId],
          user_ids: [userId]
        })
      }
    );
    
    console.log('Edge Function response status:', edgeFunctionResponse.status);
    
    if (edgeFunctionResponse.ok) {
      const responseData = await edgeFunctionResponse.json();
      console.log('Edge Function response:', responseData);
    } else {
      const errorText = await edgeFunctionResponse.text();
      console.error('Edge Function error:', errorText);
    }
    
  } catch (error) {
    console.error('Error triggering analysis:', error);
  }
}

// Usage: manualTriggerAnalysis('scan_azfqsjxc34', 'b41495b7-ee65-4e9d-a621-6a7c014b7d33')
manualTriggerAnalysis('scan_azfqsjxc34', 'b41495b7-ee65-4e9d-a621-6a7c014b7d33'); 