// Test environment variables and connections
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testEnvironment() {
  try {
    console.log('=== ENVIRONMENT TEST ===\n');
    
    console.log('1. Checking environment variables...');
    console.log(`SUPABASE_URL: ${SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
    console.log(`SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);
    
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.log('\n❌ SUPABASE_SERVICE_ROLE_KEY is missing!');
      console.log('This is required for the email scan to work.');
      return;
    }
    
    console.log('\n2. Testing Supabase connection...');
    const testResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?select=count&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`Supabase response status: ${testResponse.status}`);
    if (testResponse.ok) {
      const data = await testResponse.json();
      console.log('✅ Supabase connection successful');
      console.log(`Scan count: ${data[0]?.count || 0}`);
    } else {
      const errorText = await testResponse.text();
      console.error('❌ Supabase connection failed:', errorText);
      return;
    }
    
    console.log('\n3. Testing scan_history table access...');
    const scanResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_history?select=*&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`Scan table response status: ${scanResponse.status}`);
    if (scanResponse.ok) {
      const scans = await scanResponse.json();
      console.log('✅ Scan table access successful');
      console.log(`Found ${scans.length} scans`);
    } else {
      const errorText = await scanResponse.text();
      console.error('❌ Scan table access failed:', errorText);
    }
    
    console.log('\n4. Testing email_data table access...');
    const emailResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/email_data?select=count&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`Email table response status: ${emailResponse.status}`);
    if (emailResponse.ok) {
      const data = await emailResponse.json();
      console.log('✅ Email table access successful');
      console.log(`Email count: ${data[0]?.count || 0}`);
    } else {
      const errorText = await emailResponse.text();
      console.error('❌ Email table access failed:', errorText);
    }
    
    console.log('\n=== TEST COMPLETE ===');
    console.log('If all tests passed, the environment is configured correctly.');
    console.log('The issue is likely in the email processing logic or Gmail API calls.');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testEnvironment(); 