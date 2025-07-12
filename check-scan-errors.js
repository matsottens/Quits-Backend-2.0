// Check for scan errors
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkScanErrors() {
  try {
    console.log('=== CHECKING SCAN ERRORS ===\n');
    
    // Check recent scans with error messages
    console.log('1. Checking recent scans for errors...');
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?select=*&order=created_at.desc&limit=10`,
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
      
      let errorCount = 0;
      scans.forEach(scan => {
        console.log(`\n- ${scan.scan_id}: ${scan.status} (${scan.progress}%)`);
        console.log(`  Created: ${scan.created_at}`);
        console.log(`  Updated: ${scan.updated_at}`);
        console.log(`  Emails: ${scan.emails_found || 0} found, ${scan.emails_processed || 0} processed`);
        
        if (scan.error_message) {
          errorCount++;
          console.log(`  ❌ ERROR: ${scan.error_message}`);
        }
        
        if (scan.status === 'in_progress' && scan.progress <= 10) {
          console.log(`  ⚠️  STUCK: Scan stuck at low progress`);
        }
      });
      
      console.log(`\n=== SUMMARY ===`);
      console.log(`Total scans: ${scans.length}`);
      console.log(`Scans with errors: ${errorCount}`);
      console.log(`Scans stuck at low progress: ${scans.filter(s => s.status === 'in_progress' && s.progress <= 10).length}`);
      
      // Check for patterns
      const stuckScans = scans.filter(s => s.status === 'in_progress' && s.progress <= 10);
      if (stuckScans.length > 0) {
        console.log(`\n⚠️  PATTERN DETECTED: ${stuckScans.length} scans are stuck at low progress`);
        console.log('This suggests the async email processing is failing silently');
      }
      
    } else {
      const errorText = await scanResponse.text();
      console.error('Failed to fetch scans:', errorText);
    }
    
  } catch (error) {
    console.error('Check error:', error);
  }
}

checkScanErrors(); 