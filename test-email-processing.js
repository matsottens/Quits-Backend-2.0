import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEmailProcessing() {
  console.log('=== EMAIL PROCESSING TEST ===');
  
  try {
    // Check recent scans
    console.log('\n1. Checking recent scans...');
    const { data: recentScans, error: scanError } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, status, progress, emails_found, emails_processed, subscriptions_found, created_at, error_message')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (scanError) {
      console.error('Error fetching recent scans:', scanError);
      return;
    }
    
    console.log(`Found ${recentScans.length} recent scans:`);
    recentScans.forEach(scan => {
      console.log(`  - Scan ${scan.scan_id}: ${scan.status} (${scan.progress}%), ${scan.emails_found} emails found, ${scan.emails_processed} processed, ${scan.subscriptions_found} subscriptions`);
      if (scan.error_message) {
        console.log(`    Error: ${scan.error_message}`);
      }
    });
    
    // Check email data
    console.log('\n2. Checking email data...');
    const { data: emailData, error: emailError } = await supabase
      .from('email_data')
      .select('id, scan_id, subject, sender, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (emailError) {
      console.error('Error fetching email data:', emailError);
      return;
    }
    
    console.log(`Found ${emailData.length} email records:`);
    emailData.forEach(email => {
      console.log(`  - Email ${email.id}: "${email.subject}" from ${email.sender} (scan: ${email.scan_id})`);
    });
    
    // Check subscription analysis
    console.log('\n3. Checking subscription analysis...');
    const { data: analysisData, error: analysisError } = await supabase
      .from('subscription_analysis')
      .select('id, scan_id, subscription_name, analysis_status, confidence_score, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (analysisError) {
      console.error('Error fetching analysis data:', analysisError);
      return;
    }
    
    console.log(`Found ${analysisData.length} analysis records:`);
    analysisData.forEach(analysis => {
      console.log(`  - Analysis ${analysis.id}: ${analysis.subscription_name} (${analysis.analysis_status}, ${analysis.confidence_score} confidence) - scan: ${analysis.scan_id}`);
    });
    
    // Check for stuck scans
    console.log('\n4. Checking for stuck scans...');
    const stuckScans = recentScans.filter(scan => {
      const scanAge = Date.now() - new Date(scan.created_at).getTime();
      const isStuck = scanAge > 10 * 60 * 1000; // 10 minutes
      return isStuck && (scan.status === 'in_progress' || scan.status === 'pending');
    });
    
    if (stuckScans.length > 0) {
      console.log(`Found ${stuckScans.length} potentially stuck scans:`);
      stuckScans.forEach(scan => {
        const ageMinutes = Math.floor((Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000));
        console.log(`  - Scan ${scan.scan_id}: ${scan.status} for ${ageMinutes} minutes`);
      });
    } else {
      console.log('No stuck scans found');
    }
    
    // Check Gmail API connectivity
    console.log('\n5. Testing Gmail API connectivity...');
    try {
      const testResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid_token_for_testing'
        }
      });
      
      if (testResponse.status === 401) {
        console.log('Gmail API is reachable (expected 401 for invalid token)');
      } else {
        console.log(`Gmail API response: ${testResponse.status}`);
      }
    } catch (apiError) {
      console.error('Gmail API connectivity test failed:', apiError.message);
    }
    
    console.log('\n=== TEST COMPLETE ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testEmailProcessing(); 