// Debug script to check email scan process
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function debugEmailScan() {
  try {
    console.log('=== EMAIL SCAN DEBUG ===\n');
    
    // 1. Check recent scans
    console.log('1. Checking recent scans...');
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
      console.log(`Found ${scans.length} recent scans:`);
      scans.forEach(scan => {
        console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%) - Emails: ${scan.emails_found || 0} found, ${scan.emails_processed || 0} processed`);
      });
      
      if (scans.length > 0) {
        const latestScan = scans[0];
        console.log(`\nLatest scan: ${latestScan.scan_id}`);
        
        // 2. Check email_data for this scan
        console.log('\n2. Checking email_data for latest scan...');
        const emailDataResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/email_data?scan_id=eq.${latestScan.scan_id}&select=*&order=created_at.desc&limit=10`,
          {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        let emailData = [];
        if (emailDataResponse.ok) {
          emailData = await emailDataResponse.json();
          console.log(`Found ${emailData.length} email_data records for scan ${latestScan.scan_id}:`);
          emailData.forEach(email => {
            console.log(`- ${email.id}: "${email.subject}" from ${email.sender} (${email.content?.length || 0} chars)`);
          });
          
          if (emailData.length === 0) {
            console.log('\n❌ NO EMAIL DATA FOUND - This is the problem!');
            console.log('The email scan process is not storing email data properly.');
          }
        } else {
          const errorText = await emailDataResponse.text();
          console.error('Failed to fetch email_data:', errorText);
        }
        
        // 3. Check subscription_analysis for this scan
        console.log('\n3. Checking subscription_analysis for latest scan...');
        const analysisResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${latestScan.scan_id}&select=*&order=created_at.desc&limit=10`,
          {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        let analysis = [];
        if (analysisResponse.ok) {
          analysis = await analysisResponse.json();
          console.log(`Found ${analysis.length} subscription_analysis records for scan ${latestScan.scan_id}:`);
          analysis.forEach(item => {
            console.log(`- ${item.id}: ${item.subscription_name} (${item.analysis_status}) - Confidence: ${item.confidence_score}`);
          });
          
          if (analysis.length === 0) {
            console.log('\n❌ NO SUBSCRIPTION ANALYSIS FOUND - Pattern matching is not working!');
            console.log('The pattern matching logic is not detecting potential subscriptions.');
          }
        } else {
          const errorText = await analysisResponse.text();
          console.error('Failed to fetch subscription_analysis:', errorText);
        }
        
        // 4. Check if there are any emails at all in the system
        console.log('\n4. Checking total email_data count...');
        const totalEmailResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/email_data?select=count`,
          {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (totalEmailResponse.ok) {
          const totalEmailCount = await totalEmailResponse.json();
          console.log(`Total email_data records in system: ${totalEmailCount[0]?.count || 0}`);
        }
        
        // 5. Check if there are any subscription_analysis records at all
        console.log('\n5. Checking total subscription_analysis count...');
        const totalAnalysisResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/subscription_analysis?select=count`,
          {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (totalAnalysisResponse.ok) {
          const totalAnalysisCount = await totalAnalysisResponse.json();
          console.log(`Total subscription_analysis records in system: ${totalAnalysisCount[0]?.count || 0}`);
        }
        
        // 6. Check scan error messages
        if (latestScan.error_message) {
          console.log('\n6. Scan error message:');
          console.log(`❌ ${latestScan.error_message}`);
        }
        
        // 7. Recommendations
        console.log('\n=== RECOMMENDATIONS ===');
        if (emailData.length === 0) {
          console.log('1. The email scan is not storing email data. This could be due to:');
          console.log('   - Gmail API errors during email fetching');
          console.log('   - JSON parsing errors in email content');
          console.log('   - Database insertion errors');
          console.log('   - No emails found matching the search criteria');
          console.log('\n2. Check the email-scan.js logs for specific errors');
          console.log('3. Verify Gmail API token is valid and has proper permissions');
          console.log('4. Check if the Gmail search queries are finding any emails');
        }
        
        if (analysis.length === 0 && emailData.length > 0) {
          console.log('1. Emails are being stored but pattern matching is not detecting subscriptions');
          console.log('2. Check the pattern matching logic in analyzeEmailWithPatternMatching function');
          console.log('3. Verify the subscription keywords are appropriate for the emails being processed');
        }
        
      } else {
        console.log('No scans found in the system');
      }
    } else {
      const errorText = await scanResponse.text();
      console.error('Failed to fetch scans:', errorText);
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

debugEmailScan(); 