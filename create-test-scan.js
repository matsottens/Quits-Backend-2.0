// Create a test scan with email data to test the Edge Function
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function createTestScan() {
  console.log('=== CREATING TEST SCAN ===');
  
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not found in environment');
    return;
  }
  
  try {
    const testUserId = 'b41495b7-ee65-4e9d-a621-6a7c014b7d33';
    const testScanId = `test_scan_${Date.now()}`;
    
    console.log(`Creating test scan: ${testScanId} for user: ${testUserId}`);
    
    // 1. Create a scan record
    console.log('\n1. Creating scan record...');
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          scan_id: testScanId,
          user_id: testUserId,
          status: 'analyzing',
          progress: 0,
          emails_found: 2,
          emails_to_process: 2,
          emails_processed: 0,
          emails_scanned: 0,
          subscriptions_found: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    );
    
    if (!scanResponse.ok) {
      const errorText = await scanResponse.text();
      console.error('Failed to create scan:', errorText);
      return;
    }
    
    const scanData = await scanResponse.json();
    console.log('✅ Scan created:', scanData[0]);
    
    // 2. Create test email data
    console.log('\n2. Creating test email data...');
    const testEmails = [
      {
        scan_id: testScanId,
        user_id: testUserId,
        gmail_message_id: `test_msg_1_${Date.now()}`,
        subject: 'Your Netflix subscription payment',
        sender: 'Netflix <no-reply@netflix.com>',
        date: new Date().toISOString(),
        content: 'Thank you for your Netflix subscription payment of $15.99. Your next billing date is December 15, 2024. You can manage your subscription anytime in your account settings.',
        content_preview: 'Netflix subscription payment confirmation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        scan_id: testScanId,
        user_id: testUserId,
        gmail_message_id: `test_msg_2_${Date.now()}`,
        subject: 'Spotify Premium - Payment Confirmation',
        sender: 'Spotify <billing@spotify.com>',
        date: new Date().toISOString(),
        content: 'Your Spotify Premium subscription has been renewed. Amount: $9.99 USD. Next billing date: January 10, 2025. Thank you for being a Premium member!',
        content_preview: 'Spotify Premium payment confirmation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    const emailResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/email_data`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(testEmails)
      }
    );
    
    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Failed to create email data:', errorText);
      return;
    }
    
    const emailData = await emailResponse.json();
    console.log('✅ Email data created:', emailData.length, 'emails');
    
    // 3. Create subscription analysis records
    console.log('\n3. Creating subscription analysis records...');
    const analysisRecords = emailData.map(email => ({
      email_data_id: email.id,
      user_id: testUserId,
      scan_id: testScanId,
      analysis_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    const analysisResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_analysis`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(analysisRecords)
      }
    );
    
    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error('Failed to create analysis records:', errorText);
      return;
    }
    
    const analysisData = await analysisResponse.json();
    console.log('✅ Analysis records created:', analysisData.length, 'records');
    
    // 4. Test the Edge Function
    console.log('\n4. Testing Edge Function with the new scan...');
    const edgeFunctionResponse = await fetch(
      "https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan",
      { 
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          scan_ids: [testScanId],
          user_ids: [testUserId]
        })
      }
    );
    
    console.log('Edge Function response status:', edgeFunctionResponse.status);
    
    if (!edgeFunctionResponse.ok) {
      const errorText = await edgeFunctionResponse.text();
      console.error('Edge Function error:', errorText);
      return;
    }
    
    const responseData = await edgeFunctionResponse.json();
    console.log('Edge Function response:', responseData);
    
    // 5. Wait and check results
    console.log('\n5. Waiting 10 seconds and checking results...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check scan status
    const finalScanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?scan_id=eq.${testScanId}`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (finalScanResponse.ok) {
      const finalScan = await finalScanResponse.json();
      console.log('Final scan status:', finalScan[0]);
    }
    
    // Check analysis results
    const finalAnalysisResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${testScanId}`,
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
      console.log('Final analysis results:', finalAnalysis);
      
      const completedAnalyses = finalAnalysis.filter(a => a.analysis_status === 'completed');
      console.log(`Completed analyses: ${completedAnalyses.length}/${finalAnalysis.length}`);
    }
    
    // Check if subscriptions were created
    const subscriptionsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${testUserId}&order=created_at.desc&limit=5`,
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
      console.log('Recent subscriptions:', subscriptions);
    }
    
    console.log('\n=== TEST COMPLETE ===');
    console.log(`Test scan ID: ${testScanId}`);
    console.log('Check the results above to see if subscriptions were detected and created.');
    
  } catch (error) {
    console.error('Error creating test scan:', error);
  }
}

createTestScan(); 