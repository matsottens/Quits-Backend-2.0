// Reset failed analysis records to pending for retry
import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function resetFailedAnalysis() {
  try {
    console.log('Resetting failed analysis records to pending...');
    
    // First, check current analysis records
    const analysisResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_analysis?select=*&order=created_at.desc&limit=10`,
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
      console.log(`Found ${analysis.length} analysis records:`);
      
      const failedRecords = analysis.filter(item => 
        item.analysis_status === 'failed' || 
        item.analysis_status === 'pending'
      );
      
      console.log(`Found ${failedRecords.length} failed/pending records to reset:`);
      failedRecords.forEach(item => {
        console.log(`- ${item.id}: ${item.subscription_name} (${item.analysis_status})`);
      });
      
      if (failedRecords.length > 0) {
        // Reset failed records to pending
        for (const record of failedRecords) {
          console.log(`Resetting analysis record ${record.id} to pending...`);
          
          const resetResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/subscription_analysis?id=eq.${record.id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                analysis_status: 'pending',
                gemini_response: null,
                updated_at: new Date().toISOString()
              })
            }
          );
          
          if (resetResponse.ok) {
            console.log(`Successfully reset analysis record ${record.id}`);
          } else {
            const errorText = await resetResponse.text();
            console.error(`Failed to reset analysis record ${record.id}:`, errorText);
          }
        }
        
        // Also reset the scan status to ready_for_analysis
        if (failedRecords.length > 0) {
          const scanId = failedRecords[0].scan_id;
          console.log(`\nResetting scan ${scanId} to ready_for_analysis...`);
          
          const scanResetResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scanId}`,
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
          
          if (scanResetResponse.ok) {
            console.log(`Successfully reset scan ${scanId} to ready_for_analysis`);
            console.log('\nReady to retry analysis with improved rate limiting!');
          } else {
            const errorText = await scanResetResponse.text();
            console.error(`Failed to reset scan ${scanId}:`, errorText);
          }
        }
      } else {
        console.log('No failed analysis records found to reset.');
      }
    } else {
      const errorText = await analysisResponse.text();
      console.error('Failed to fetch analysis records:', errorText);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

resetFailedAnalysis(); 