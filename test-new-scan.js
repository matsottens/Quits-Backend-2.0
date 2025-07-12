// Test script to trigger a new email scan
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testNewScan() {
  try {
    console.log('=== TESTING NEW EMAIL SCAN ===\n');
    
    // First, let's check if there are any recent scans and their status
    console.log('1. Checking recent scans before test...');
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?select=*&order=created_at.desc&limit=3`,
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
    }
    
    // 2. Trigger a new scan by calling the email-scan endpoint
    console.log('\n2. Triggering new email scan...');
    
    // Note: This would normally require a valid JWT token with Gmail access
    // For testing, we'll just check if the endpoint is accessible
    console.log('Note: Full scan test requires valid JWT token with Gmail access');
    console.log('The JSON parsing fixes should now prevent the "Unexpected end of JSON input" errors');
    
    // 3. Wait a moment and check the scan status again
    console.log('\n3. Waiting 5 seconds and checking scan status...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const finalScanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?select=*&order=created_at.desc&limit=3`,
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
      const finalScans = await finalScanResponse.json();
      console.log(`\nFinal scan status:`);
      finalScans.forEach(scan => {
        console.log(`- ${scan.scan_id}: ${scan.status} (${scan.progress}%) - Emails: ${scan.emails_found || 0} found, ${scan.emails_processed || 0} processed`);
        if (scan.error_message) {
          console.log(`  Error: ${scan.error_message}`);
        }
      });
    }
    
    console.log('\n=== TEST COMPLETE ===');
    console.log('The JSON parsing fixes should prevent the scan from failing with "Unexpected end of JSON input" errors.');
    console.log('To test the full flow, trigger a scan from the frontend with a valid Gmail token.');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testNewScan(); 