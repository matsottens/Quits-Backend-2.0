// Test the fixed scan flow
import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testFixedFlow() {
  try {
    console.log('=== TESTING FIXED SCAN FLOW ===');
    
    // 1. Check current scans
    console.log('\n1. Checking current scans...');
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
        console.log(`  User ID: ${scan.user_id}`);
        console.log(`  Created: ${scan.created_at}`);
        console.log(`  Updated: ${scan.updated_at}`);
        console.log('');
      });
      
      // 2. Check subscription analysis records
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
        
        // 3. Check if any scans need to be processed
        const readyScans = scans.filter(scan => scan.status === 'ready_for_analysis');
        const completedScans = scans.filter(scan => scan.status === 'completed');
        const pendingAnalysis = analysis.filter(item => item.analysis_status === 'pending');
        
        console.log(`\n3. Flow Status:`);
        console.log(`- Scans ready for analysis: ${readyScans.length}`);
        console.log(`- Scans completed: ${completedScans.length}`);
        console.log(`- Analysis records pending: ${pendingAnalysis.length}`);
        
        // 4. If there are scans ready for analysis, trigger the Edge Function
        if (readyScans.length > 0) {
          console.log('\n4. Triggering Edge Function for ready scans...');
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
          
          // 5. Wait and check again
          console.log('\n5. Waiting 10 seconds and checking results...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          
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
          
          // 6. Check subscriptions table
          console.log('\n6. Checking subscriptions table...');
          const subscriptionResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/subscriptions?select=*&order=created_at.desc&limit=5`,
            {
              method: 'GET',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (subscriptionResponse.ok) {
            const subscriptions = await subscriptionResponse.json();
            console.log(`\nSubscriptions in table: ${subscriptions.length}`);
            subscriptions.forEach(sub => {
              console.log(`- ${sub.name} (price: ${sub.price}, billing: ${sub.billing_cycle})`);
            });
          }
        } else {
          console.log('\n4. No scans ready for analysis. The flow should work correctly for new scans.');
        }
      }
      
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

// Run the test
testFixedFlow(); 