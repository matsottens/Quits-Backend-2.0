// Fix stuck scan by manually triggering Edge Function
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fixStuckScan() {
  try {
    console.log('=== FIXING STUCK SCAN ===\n');
    
    // 1. Check the stuck scan
    console.log('1. Checking stuck scan...');
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.scan_cgn55veqb17&select=*`,
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
      `${SUPABASE_URL}/rest/v1/email_data?scan_id=eq.scan_cgn55veqb17&select=*`,
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
      `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.scan_cgn55veqb17&select=*`,
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
    }
    
    // 4. If no email data, the scan never actually processed emails
    // Let's check if we need to reset the scan status
    console.log('\n4. Checking if scan needs to be reset...');
    
    const emailDataResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/email_data?scan_id=eq.scan_cgn55veqb17&select=count`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (emailDataResponse.ok) {
      const emailCount = await emailDataResponse.json();
      console.log(`Email count for scan: ${emailCount[0]?.count || 0}`);
      
      if (emailCount[0]?.count === 0) {
        console.log('\n5. No email data found - scan never processed emails properly');
        console.log('Resetting scan status to ready_for_analysis...');
        
        const resetResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.scan_cgn55veqb17`,
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
          console.log('Scan status reset successfully');
        } else {
          const error = await resetResponse.text();
          console.error('Failed to reset scan status:', error);
        }
      }
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
        }
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