const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function testAsyncScan() {
  console.log('🧪 Testing async scan flow...');
  
  try {
    // Check for recent scans
    const { data: recentScans, error: scanError } = await supabase
      .from('scan_history')
      .select('scan_id, status, progress, created_at, emails_processed, subscriptions_found')
      .order('created_at', { ascending: false })
      .limit(5);

    if (scanError) {
      console.error('Error fetching recent scans:', scanError);
      return;
    }

    if (!recentScans || recentScans.length === 0) {
      console.log('No recent scans found');
      return;
    }

    console.log(`Found ${recentScans.length} recent scans:`);
    recentScans.forEach((scan, index) => {
      const age = Math.floor((Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000));
      console.log(`  ${index + 1}. ${scan.scan_id} - ${scan.status} (${scan.progress}%) - ${age}min ago - ${scan.emails_processed} emails`);
    });

    // Check for stuck scans
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckScans, error: stuckError } = await supabase
      .from('scan_history')
      .select('scan_id, status, progress, created_at')
      .eq('status', 'in_progress')
      .lt('created_at', tenMinutesAgo);

    if (stuckError) {
      console.error('Error checking stuck scans:', stuckError);
    } else if (stuckScans && stuckScans.length > 0) {
      console.log(`⚠️  Found ${stuckScans.length} potentially stuck scans:`);
      stuckScans.forEach(scan => {
        const age = Math.floor((Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000));
        console.log(`  - ${scan.scan_id} (${age} minutes old, ${scan.progress}% progress)`);
      });
    } else {
      console.log('✅ No stuck scans found');
    }

    // Check subscription analysis results
    const { data: analysisResults, error: analysisError } = await supabase
      .from('subscription_analysis')
      .select('scan_id, subscription_name, analysis_status, confidence_score')
      .order('created_at', { ascending: false })
      .limit(10);

    if (analysisError) {
      console.error('Error fetching analysis results:', analysisError);
    } else if (analysisResults && analysisResults.length > 0) {
      console.log(`📊 Found ${analysisResults.length} recent analysis results:`);
      
      // Group by scan_id
      const resultsByScan = {};
      analysisResults.forEach(result => {
        if (!resultsByScan[result.scan_id]) {
          resultsByScan[result.scan_id] = [];
        }
        resultsByScan[result.scan_id].push(result);
      });

      Object.entries(resultsByScan).forEach(([scanId, results]) => {
        const pending = results.filter(r => r.analysis_status === 'pending').length;
        const completed = results.filter(r => r.analysis_status === 'completed').length;
        const failed = results.filter(r => r.analysis_status === 'failed').length;
        
        console.log(`  ${scanId}: ${completed} completed, ${pending} pending, ${failed} failed`);
        results.slice(0, 3).forEach(result => {
          console.log(`    - ${result.subscription_name} (${result.confidence_score} confidence, ${result.analysis_status})`);
        });
      });
    } else {
      console.log('No analysis results found');
    }

    console.log('\n🎉 Async scan test completed!');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testAsyncScan(); 