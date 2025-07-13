// Test script to check scan analysis status
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdHNsdWZsd3h6a3dvdXhjamtoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDAzMDE2NiwiZXhwIjoyMDU5NjA2MTY2fQ.wTG6R5ch0KvVMfpYqG2rvi3jPrU41pcvd1ZUmsLQ8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkScanAnalysis() {
  console.log('Checking scan analysis status...');
  
  try {
    // Get recent scans
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
      console.log(`- Scan ${scan.scan_id}: ${scan.status} (${scan.emails_processed} emails, ${scan.subscriptions_found} subscriptions)`);
    });
    
    if (scans.length === 0) {
      console.log('No scans found');
      return;
    }
    
    // Get the most recent scan
    const latestScan = scans[0];
    console.log(`\nAnalyzing latest scan: ${latestScan.scan_id}`);
    
    // Get subscription analysis records for this scan
    const { data: analyses, error: analysisError } = await supabase
      .from('subscription_analysis')
      .select('*')
      .eq('scan_id', latestScan.scan_id);
    
    if (analysisError) {
      console.error('Error fetching analyses:', analysisError);
      return;
    }
    
    console.log(`Found ${analyses.length} analysis records:`);
    
    const statusCounts = {};
    analyses.forEach(analysis => {
      statusCounts[analysis.analysis_status] = (statusCounts[analysis.analysis_status] || 0) + 1;
      
      if (analysis.analysis_status === 'completed' && analysis.subscription_name) {
        console.log(`  ✅ Subscription found: ${analysis.subscription_name} - $${analysis.price}`);
      }
    });
    
    console.log('\nAnalysis status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    
    // Check if any subscriptions were actually inserted
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', latestScan.user_id)
      .gte('created_at', latestScan.created_at);
    
    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      return;
    }
    
    console.log(`\nFound ${subscriptions.length} subscriptions created after scan:`);
    subscriptions.forEach(sub => {
      console.log(`  - ${sub.name}: $${sub.price} (${sub.category})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkScanAnalysis(); 