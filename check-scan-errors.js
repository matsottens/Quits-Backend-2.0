import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkScanErrors() {
  console.log('=== CHECKING SCAN ERRORS ===');
  
  try {
    // Check recent scans for errors
    console.log('\n1. Checking recent scans for errors...');
    const { data: recentScans, error: scanError } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, status, progress, error_message, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (scanError) {
      console.error('Error fetching recent scans:', scanError);
      return;
    }
    
    console.log(`Found ${recentScans.length} recent scans:`);
    recentScans.forEach(scan => {
      const ageMinutes = Math.floor((Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000));
      console.log(`  - Scan ${scan.scan_id}: ${scan.status} (${scan.progress}%), ${ageMinutes} minutes old`);
      if (scan.error_message) {
        console.log(`    Error: ${scan.error_message}`);
      }
    });
    
    // Check for stuck scans (in_progress for more than 5 minutes)
    console.log('\n2. Checking for stuck scans...');
    const stuckScans = recentScans.filter(scan => {
      const ageMinutes = Math.floor((Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000));
      return scan.status === 'in_progress' && ageMinutes > 5;
    });
    
    if (stuckScans.length > 0) {
      console.log(`Found ${stuckScans.length} potentially stuck scans:`);
      stuckScans.forEach(scan => {
        const ageMinutes = Math.floor((Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000));
        console.log(`  - Scan ${scan.scan_id}: stuck at ${scan.progress}% for ${ageMinutes} minutes`);
      });
    } else {
      console.log('No stuck scans found');
    }
    
    // Check if subscription_examples table exists and has data
    console.log('\n3. Checking subscription_examples table...');
    try {
      const { data: examples, error: examplesError } = await supabase
        .from('subscription_examples')
        .select('id, service_name')
        .limit(5);
      
      if (examplesError) {
        console.error('Error accessing subscription_examples table:', examplesError);
      } else {
        console.log(`Subscription_examples table accessible, found ${examples?.length || 0} examples`);
        if (examples && examples.length > 0) {
          examples.forEach(example => {
            console.log(`  - ${example.service_name}`);
          });
        }
      }
    } catch (error) {
      console.error('Exception accessing subscription_examples table:', error);
    }
    
    // Check if email_data table exists and has data
    console.log('\n4. Checking email_data table...');
    try {
      const { data: emailData, error: emailError } = await supabase
        .from('email_data')
        .select('id, scan_id, subject')
        .limit(5);
      
      if (emailError) {
        console.error('Error accessing email_data table:', emailError);
      } else {
        console.log(`Email_data table accessible, found ${emailData?.length || 0} records`);
      }
    } catch (error) {
      console.error('Exception accessing email_data table:', error);
    }
    
    // Check if subscription_analysis table exists and has data
    console.log('\n5. Checking subscription_analysis table...');
    try {
      const { data: analysisData, error: analysisError } = await supabase
        .from('subscription_analysis')
        .select('id, scan_id, subscription_name, analysis_status')
        .limit(5);
      
      if (analysisError) {
        console.error('Error accessing subscription_analysis table:', analysisError);
      } else {
        console.log(`Subscription_analysis table accessible, found ${analysisData?.length || 0} records`);
      }
    } catch (error) {
      console.error('Exception accessing subscription_analysis table:', error);
    }
    
    console.log('\n=== CHECK COMPLETE ===');
    
  } catch (error) {
    console.error('Check failed:', error);
  }
}

// Run the check
checkScanErrors(); 