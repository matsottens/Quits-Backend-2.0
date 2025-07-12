// Check and trigger Edge Function
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkAndTrigger() {
  try {
    console.log('Checking current state...');
    
    // Check scan history
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
        console.log(`  Emails found: ${scan.emails_found}`);
        console.log(`  Emails processed: ${scan.emails_processed}`);
        console.log(`  Subscriptions found: ${scan.subscriptions_found}`);
        console.log('');
      });
    }
    
    // Check subscription analysis
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
      
      const statusCounts = analysis.reduce((acc, item) => {
        acc[item.analysis_status] = (acc[item.analysis_status] || 0) + 1;
        return acc;
      }, {});
      console.log('Analysis status breakdown:', statusCounts);
      
      analysis.forEach(item => {
        console.log(`- ${item.id}: ${item.subscription_name} (${item.analysis_status})`);
        console.log(`  Scan ID: ${item.scan_id}`);
        console.log(`  Email Data ID: ${item.email_data_id}`);
        console.log(`  Confidence: ${item.confidence_score}`);
        console.log('');
      });
    }
    
    // Check subscriptions table
    const subscriptionsResponse = await fetch(
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
    
    if (subscriptionsResponse.ok) {
      const subscriptions = await subscriptionsResponse.json();
      console.log(`Found ${subscriptions.length} subscriptions in subscriptions table:`);
      subscriptions.forEach(sub => {
        console.log(`- ${sub.name}: ${sub.price} ${sub.currency}`);
        console.log(`  Billing: ${sub.billing_cycle}`);
        console.log(`  Category: ${sub.category}`);
        console.log('');
      });
    }
    
    // Update any scans to ready_for_analysis if they're not already
    if (scanResponse.ok) {
      const scans = await scanResponse.json();
      for (const scan of scans) {
        if (scan.status !== 'ready_for_analysis' && scan.status !== 'completed') {
          console.log(`Updating scan ${scan.scan_id} to ready_for_analysis...`);
          
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
            console.log('Scan updated successfully');
          } else {
            const errorText = await updateResponse.text();
            console.error('Failed to update scan:', errorText);
          }
        }
      }
    }
    
    // Trigger the Edge Function
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

checkAndTrigger(); 