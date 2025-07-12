const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables:');
  console.error('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRoleKey ? 'Set' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function fixStuckScans() {
  console.log('🔧 Fixing stuck scans...');
  
  try {
    // Find scans that have been stuck in ready_for_analysis for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    console.log('Looking for scans stuck in ready_for_analysis status...');
    const { data: stuckScans, error: stuckError } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, created_at, status, emails_processed, subscriptions_found')
      .eq('status', 'ready_for_analysis')
      .lt('created_at', tenMinutesAgo)
      .order('created_at', { ascending: true });

    if (stuckError) {
      console.error('Error fetching stuck scans:', stuckError);
      return;
    }

    if (!stuckScans || stuckScans.length === 0) {
      console.log('✅ No stuck scans found');
      return;
    }

    console.log(`Found ${stuckScans.length} stuck scans:`);
    stuckScans.forEach(scan => {
      const age = Math.floor((Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000));
      console.log(`  - ${scan.scan_id} (${age} minutes old, ${scan.emails_processed} emails processed)`);
    });

    // Check if these scans have any analysis results
    for (const scan of stuckScans) {
      console.log(`\nChecking scan ${scan.scan_id}...`);
      
      const { data: analysisResults, error: analysisError } = await supabase
        .from('subscription_analysis')
        .select('id, analysis_status, subscription_name')
        .eq('scan_id', scan.scan_id);

      if (analysisError) {
        console.error(`Error checking analysis for ${scan.scan_id}:`, analysisError);
        continue;
      }

      if (!analysisResults || analysisResults.length === 0) {
        console.log(`  ❌ No analysis results found - marking as failed`);
        
        // Mark scan as failed since no analysis was performed
        const { error: updateError } = await supabase
          .from('scan_history')
          .update({
            status: 'failed',
            error_message: 'Scan stuck in ready_for_analysis with no analysis results',
            updated_at: new Date().toISOString()
          })
          .eq('scan_id', scan.scan_id);

        if (updateError) {
          console.error(`Error updating scan ${scan.scan_id}:`, updateError);
        } else {
          console.log(`  ✅ Marked scan ${scan.scan_id} as failed`);
        }
      } else {
        const completedCount = analysisResults.filter(a => a.analysis_status === 'completed').length;
        const pendingCount = analysisResults.filter(a => a.analysis_status === 'pending').length;
        const failedCount = analysisResults.filter(a => a.analysis_status === 'failed').length;
        
        console.log(`  📊 Analysis results: ${completedCount} completed, ${pendingCount} pending, ${failedCount} failed`);
        
        if (completedCount > 0) {
          console.log(`  ✅ Marking scan as completed (${completedCount} subscriptions found)`);
          
          // Mark scan as completed since we have results
          const { error: updateError } = await supabase
            .from('scan_history')
            .update({
              status: 'completed',
              subscriptions_found: completedCount,
              progress: 100,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('scan_id', scan.scan_id);

          if (updateError) {
            console.error(`Error updating scan ${scan.scan_id}:`, updateError);
          } else {
            console.log(`  ✅ Marked scan ${scan.scan_id} as completed`);
          }
        } else if (pendingCount > 0) {
          console.log(`  ⏳ Scan has pending analysis - keeping as ready_for_analysis`);
        } else {
          console.log(`  ❌ All analysis failed - marking scan as failed`);
          
          // Mark scan as failed since all analysis failed
          const { error: updateError } = await supabase
            .from('scan_history')
            .update({
              status: 'failed',
              error_message: 'All subscription analysis failed',
              updated_at: new Date().toISOString()
            })
            .eq('scan_id', scan.scan_id);

          if (updateError) {
            console.error(`Error updating scan ${scan.scan_id}:`, updateError);
          } else {
            console.log(`  ✅ Marked scan ${scan.scan_id} as failed`);
          }
        }
      }
    }

    // Also check for scans stuck in analyzing status for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    console.log('\nLooking for scans stuck in analyzing status...');
    const { data: analyzingScans, error: analyzingError } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, created_at, status')
      .eq('status', 'analyzing')
      .lt('updated_at', fiveMinutesAgo)
      .order('created_at', { ascending: true });

    if (analyzingError) {
      console.error('Error fetching analyzing scans:', analyzingError);
    } else if (analyzingScans && analyzingScans.length > 0) {
      console.log(`Found ${analyzingScans.length} scans stuck in analyzing status:`);
      
      for (const scan of analyzingScans) {
        const age = Math.floor((Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000));
        console.log(`  - ${scan.scan_id} (${age} minutes old)`);
        
        // Reset back to ready_for_analysis so they can be retried
        const { error: resetError } = await supabase
          .from('scan_history')
          .update({
            status: 'ready_for_analysis',
            updated_at: new Date().toISOString()
          })
          .eq('scan_id', scan.scan_id);

        if (resetError) {
          console.error(`Error resetting scan ${scan.scan_id}:`, resetError);
        } else {
          console.log(`  ✅ Reset scan ${scan.scan_id} back to ready_for_analysis`);
        }
      }
    } else {
      console.log('✅ No scans stuck in analyzing status');
    }

    console.log('\n🎉 Stuck scan cleanup completed!');

  } catch (error) {
    console.error('Error fixing stuck scans:', error);
    process.exit(1);
  }
}

// Run the fix
fixStuckScans(); 