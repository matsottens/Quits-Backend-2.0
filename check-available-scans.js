// Check available scans in the database
import fetch from 'node-fetch';

async function checkAvailableScans() {
  console.log('=== CHECKING AVAILABLE SCANS ===');
  
  try {
    const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not found in environment');
      return;
    }
    
    // Get all scans
    console.log('\n1. Fetching all scans...');
    const scansResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?select=*&order=created_at.desc&limit=20`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!scansResponse.ok) {
      const errorText = await scansResponse.text();
      console.error('Failed to fetch scans:', errorText);
      return;
    }
    
    const scans = await scansResponse.json();
    console.log(`Found ${scans.length} scans:`);
    
    scans.forEach((scan, index) => {
      console.log(`${index + 1}. Scan ID: ${scan.scan_id}`);
      console.log(`   User ID: ${scan.user_id}`);
      console.log(`   Status: ${scan.status}`);
      console.log(`   Created: ${scan.created_at}`);
      console.log(`   Completed: ${scan.completed_at || 'Not completed'}`);
      console.log(`   Subscriptions found: ${scan.subscriptions_found || 0}`);
      console.log(`   Error: ${scan.error_message || 'None'}`);
      console.log('');
    });
    
    // Check for scans in "analyzing" status
    const analyzingScans = scans.filter(scan => scan.status === 'analyzing');
    console.log(`\n2. Scans in "analyzing" status: ${analyzingScans.length}`);
    
    if (analyzingScans.length > 0) {
      analyzingScans.forEach((scan, index) => {
        console.log(`${index + 1}. ${scan.scan_id} (User: ${scan.user_id})`);
      });
    } else {
      console.log('No scans in "analyzing" status found.');
      
      // Check for scans in "pending" status that could be triggered
      const pendingScans = scans.filter(scan => scan.status === 'pending');
      console.log(`\n3. Scans in "pending" status: ${pendingScans.length}`);
      
      if (pendingScans.length > 0) {
        pendingScans.forEach((scan, index) => {
          console.log(`${index + 1}. ${scan.scan_id} (User: ${scan.user_id})`);
        });
      }
    }
    
    // Check subscription analysis records
    console.log('\n4. Checking subscription analysis records...');
    const analysisResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_analysis?select=*&order=created_at.desc&limit=10`,
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
      const analyses = await analysisResponse.json();
      console.log(`Found ${analyses.length} subscription analysis records:`);
      
      analyses.forEach((analysis, index) => {
        console.log(`${index + 1}. Analysis ID: ${analysis.id}`);
        console.log(`   Scan ID: ${analysis.scan_id}`);
        console.log(`   User ID: ${analysis.user_id}`);
        console.log(`   Status: ${analysis.analysis_status}`);
        console.log(`   Created: ${analysis.created_at}`);
        console.log('');
      });
      
      // Check for pending analyses
      const pendingAnalyses = analyses.filter(a => a.analysis_status === 'pending');
      console.log(`Pending analyses: ${pendingAnalyses.length}`);
      
      if (pendingAnalyses.length > 0) {
        const scanIds = [...new Set(pendingAnalyses.map(a => a.scan_id))];
        console.log(`Scans with pending analyses: ${scanIds.join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error('Error checking scans:', error);
  }
}

checkAvailableScans(); 