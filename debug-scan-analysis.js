// Debug script to check scan analysis flow
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function debugScanAnalysis() {
  try {
    console.log('=== DEBUGGING SCAN ANALYSIS FLOW ===\n');
    
    // 1. Check recent scans
    console.log('1. Checking recent scans...');
    const { data: scans, error: scanError } = await supabase
      .from('scan_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (scanError) {
      console.error('Error fetching scans:', scanError);
      return;
    }
    
    console.log(`Found ${scans.length} recent scans:`);
    scans.forEach(scan => {
      console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%) - Created: ${scan.created_at}`);
    });
    
    // 2. Check email data
    console.log('\n2. Checking email data...');
    const { data: emailData, error: emailError } = await supabase
      .from('email_data')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (emailError) {
      console.error('Error fetching email data:', emailError);
    } else {
      console.log(`Found ${emailData.length} email records:`);
      emailData.forEach(email => {
        console.log(`- ${email.id}: ${email.subject} (${email.sender}) - Scan: ${email.scan_id}`);
      });
    }
    
    // 3. Check subscription analysis records
    console.log('\n3. Checking subscription analysis records...');
    const { data: analysis, error: analysisError } = await supabase
      .from('subscription_analysis')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (analysisError) {
      console.error('Error fetching analysis records:', analysisError);
    } else {
      console.log(`Found ${analysis.length} analysis records:`);
      analysis.forEach(item => {
        console.log(`- ${item.id}: ${item.subscription_name} (${item.analysis_status}) - Scan: ${item.scan_id}`);
      });
    }
    
    // 4. Check for scans ready for analysis
    console.log('\n4. Checking scans ready for analysis...');
    const { data: readyScans, error: readyError } = await supabase
      .from('scan_history')
      .select('*')
      .eq('status', 'ready_for_analysis');
    
    if (readyError) {
      console.error('Error fetching ready scans:', readyError);
    } else {
      console.log(`Found ${readyScans.length} scans ready for analysis:`);
      readyScans.forEach(scan => {
        console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%)`);
      });
    }
    
    // 5. Check for pending analysis records
    console.log('\n5. Checking pending analysis records...');
    const { data: pendingAnalysis, error: pendingError } = await supabase
      .from('subscription_analysis')
      .select('*')
      .eq('analysis_status', 'pending');
    
    if (pendingError) {
      console.error('Error fetching pending analysis:', pendingError);
    } else {
      console.log(`Found ${pendingAnalysis.length} pending analysis records:`);
      pendingAnalysis.forEach(item => {
        console.log(`- ${item.id}: ${item.subscription_name} - Scan: ${item.scan_id} - Email: ${item.email_data_id}`);
      });
    }
    
    // 6. Check for analyzing scans
    console.log('\n6. Checking analyzing scans...');
    const { data: analyzingScans, error: analyzingError } = await supabase
      .from('scan_history')
      .select('*')
      .eq('status', 'analyzing');
    
    if (analyzingError) {
      console.error('Error fetching analyzing scans:', analyzingError);
    } else {
      console.log(`Found ${analyzingScans.length} scans being analyzed:`);
      analyzingScans.forEach(scan => {
        console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%) - Updated: ${scan.updated_at}`);
      });
    }
    
    // 7. Check for completed scans
    console.log('\n7. Checking completed scans...');
    const { data: completedScans, error: completedError } = await supabase
      .from('scan_history')
      .select('*')
      .eq('status', 'completed');
    
    if (completedError) {
      console.error('Error fetching completed scans:', completedError);
    } else {
      console.log(`Found ${completedScans.length} completed scans:`);
      completedScans.forEach(scan => {
        console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%) - Completed: ${scan.completed_at}`);
      });
    }
    
    // 8. Check for quota exhausted scans
    console.log('\n8. Checking quota exhausted scans...');
    const { data: quotaScans, error: quotaError } = await supabase
      .from('scan_history')
      .select('*')
      .eq('status', 'quota_exhausted');
    
    if (quotaError) {
      console.error('Error fetching quota exhausted scans:', quotaError);
    } else {
      console.log(`Found ${quotaScans.length} quota exhausted scans:`);
      quotaScans.forEach(scan => {
        console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%) - Error: ${scan.error_message}`);
      });
    }
    
    console.log('\n=== ANALYSIS COMPLETE ===');
    
    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total scans: ${scans.length}`);
    console.log(`Email records: ${emailData?.length || 0}`);
    console.log(`Analysis records: ${analysis?.length || 0}`);
    console.log(`Ready for analysis: ${readyScans?.length || 0}`);
    console.log(`Pending analysis: ${pendingAnalysis?.length || 0}`);
    console.log(`Currently analyzing: ${analyzingScans?.length || 0}`);
    console.log(`Completed: ${completedScans?.length || 0}`);
    console.log(`Quota exhausted: ${quotaScans?.length || 0}`);
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

debugScanAnalysis(); 