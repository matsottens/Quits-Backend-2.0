// Manual trigger test script
import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testManualTrigger() {
  try {
    console.log('=== MANUAL TRIGGER TEST ===');
    
    // First, check what scans exist
    console.log('\n1. Checking scan history...');
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
        console.log(`  User ID: ${scan.user_id}`);
        console.log(`  Emails found: ${scan.emails_found}`);
        console.log(`  Emails processed: ${scan.emails_processed}`);
        console.log(`  Subscriptions found: ${scan.subscriptions_found}`);
        console.log(`  Created: ${scan.created_at}`);
        console.log(`  Updated: ${scan.updated_at}`);
        console.log('');
      });
      
      // Check if any scans are ready for analysis
      const readyScans = scans.filter(scan => scan.status === 'ready_for_analysis');
      console.log(`Scans ready for analysis: ${readyScans.length}`);
      
      if (readyScans.length === 0) {
        console.log('\nNo scans ready for analysis. Checking if we need to update any scans...');
        
        // Check if any scans are in progress and should be moved to ready_for_analysis
        const inProgressScans = scans.filter(scan => scan.status === 'in_progress');
        console.log(`Scans in progress: ${inProgressScans.length}`);
        
        // Also check if any completed scans have pending analysis that needs to be processed
        const completedScans = scans.filter(scan => scan.status === 'completed');
        console.log(`Scans completed: ${completedScans.length}`);
        
        if (inProgressScans.length > 0) {
          console.log('Updating in-progress scans to ready_for_analysis...');
          
          for (const scan of inProgressScans) {
            const updateResponse = await fetch(
              `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scan.scan_id}`,
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
              console.log(`Updated scan ${scan.scan_id} to ready_for_analysis`);
            } else {
              const errorText = await updateResponse.text();
              console.error(`Failed to update scan ${scan.scan_id}:`, errorText);
            }
          }
        } else if (completedScans.length > 0) {
          // Update the most recent completed scan to ready_for_analysis so Edge Function can process pending analysis
          const mostRecentScan = completedScans[0];
          console.log(`Updating most recent completed scan ${mostRecentScan.scan_id} to ready_for_analysis for analysis processing...`);
          
          const updateResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${mostRecentScan.scan_id}`,
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
            console.log(`Updated scan ${mostRecentScan.scan_id} to ready_for_analysis`);
          } else {
            const errorText = await updateResponse.text();
            console.error(`Failed to update scan ${mostRecentScan.scan_id}:`, errorText);
          }
        }
      }
    } else {
      const errorText = await scanResponse.text();
      console.error('Failed to fetch scans:', errorText);
    }
    
    // Check subscription analysis records
    console.log('\n2. Checking subscription analysis records...');
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
      
      // Group by status
      const byStatus = analysis.reduce((acc, item) => {
        const status = item.analysis_status || 'unknown';
        if (!acc[status]) acc[status] = [];
        acc[status].push(item);
        return acc;
      }, {});
      
      Object.entries(byStatus).forEach(([status, items]) => {
        console.log(`\nStatus: ${status} (${items.length} records)`);
        items.forEach(item => {
          console.log(`  - ${item.subscription_name} (confidence: ${item.confidence_score})`);
        });
      });
    } else {
      const errorText = await analysisResponse.text();
      console.error('Failed to fetch analysis:', errorText);
    }
    
    // Now trigger the Edge Function
    console.log('\n3. Triggering Edge Function...');
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
    
    console.log('Edge Function response status:', triggerResponse.status);
    if (triggerResponse.ok) {
      const triggerData = await triggerResponse.json();
      console.log('Edge Function response:', triggerData);
    } else {
      const errorText = await triggerResponse.text();
      console.error('Edge Function error:', errorText);
    }
    
    // Wait a moment and check again
    console.log('\n4. Waiting 5 seconds and checking again...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const finalAnalysisResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_analysis?analysis_status=eq.completed&select=*&order=created_at.desc&limit=5`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (finalAnalysisResponse.ok) {
      const finalAnalysis = await finalAnalysisResponse.json();
      console.log(`\nCompleted analysis records: ${finalAnalysis.length}`);
      finalAnalysis.forEach(item => {
        console.log(`- ${item.subscription_name} (price: ${item.price}, confidence: ${item.confidence_score})`);
      });
    }
    
  } catch (error) {
    console.error('Error in manual trigger test:', error);
  }
}

// Run the test
testManualTrigger(); 