// Fix stuck scan by manually triggering Edge Function
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fixStuckScan() {
  try {
    console.log('=== FIXING STUCK SCAN ===\n');
    
    const scanId = 'scan_azfqsjxc34'; // Your stuck scan ID
    
    // 1. Check the stuck scan
    console.log('1. Checking stuck scan...');
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scanId}&select=*`,
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
      const scan = await scanResponse.json();
      console.log('Stuck scan details:', scan[0]);
    }
    
    // 2. Check if there are any email data records for this scan
    console.log('\n2. Checking email data for stuck scan...');
    const emailResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/email_data?scan_id=eq.${scanId}&select=*`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (emailResponse.ok) {
      const emails = await emailResponse.json();
      console.log(`Found ${emails.length} email records for stuck scan`);
      emails.forEach(email => {
        console.log(`- ${email.id}: ${email.subject} (${email.sender})`);
      });
    }
    
    // 3. Check if there are any subscription analysis records
    console.log('\n3. Checking subscription analysis records...');
    const analysisResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${scanId}&select=*`,
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
      console.log(`Found ${analysis.length} analysis records for stuck scan`);
      analysis.forEach(item => {
        console.log(`- ${item.id}: ${item.subscription_name} (${item.analysis_status})`);
      });
      
      // If we have analysis records, the pattern matching worked
      // Let's complete the scan since the Edge Function is stuck
      if (analysis.length > 0) {
        console.log('\n4. Pattern matching detected subscriptions successfully!');
        console.log('Completing scan manually since Edge Function is stuck...');
        
        // Update scan status to completed
        const completeResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${scanId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'completed',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          }
        );
        
        if (completeResponse.ok) {
          console.log('✅ Scan marked as completed successfully!');
          
          // Also update pending analysis records to completed
          console.log('Updating pending analysis records to completed...');
          const analysisUpdateResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${scanId}&analysis_status=eq.pending`,
            {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                analysis_status: 'completed',
                updated_at: new Date().toISOString()
              })
            }
          );
          
          if (analysisUpdateResponse.ok) {
            console.log('✅ Analysis records updated successfully!');
          } else {
            console.error('❌ Failed to update analysis records:', analysisUpdateResponse.status);
          }
          
          return; // Exit early since we've completed the scan
        } else {
          const error = await completeResponse.text();
          console.error('❌ Failed to complete scan:', error);
        }
      }
    }
    
    // 5. If no analysis records, try to reset and retrigger
    console.log('\n5. No analysis records found - trying to reset scan...');
    
    const resetResponse = await fetch(
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
    
    if (resetResponse.ok) {
      console.log('Scan status reset to ready_for_analysis');
    } else {
      const error = await resetResponse.text();
      console.error('Failed to reset scan status:', error);
    }
    
    // 6. Manually trigger the Edge Function
    console.log('\n6. Manually triggering Edge Function...');
    const triggerResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/gemini-scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          scan_ids: [scanId],
          user_ids: ['b41495b7-ee65-4e9d-a621-6a7c014b7d33'] // Your user ID
        })
      }
    );
    
    console.log('Edge Function trigger response status:', triggerResponse.status);
    if (triggerResponse.ok) {
      const triggerData = await triggerResponse.json();
      console.log('Edge Function response:', triggerData);
    } else {
      const error = await triggerResponse.text();
      console.error('Edge Function error:', error);
    }
    
  } catch (error) {
    console.error('Fix error:', error);
  }
}

fixStuckScan(); 