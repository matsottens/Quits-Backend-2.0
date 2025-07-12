// Test Supabase connection
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.log('Testing Supabase connection...');
console.log('SUPABASE_URL:', supabaseUrl);
console.log('SUPABASE_SERVICE_KEY length:', supabaseServiceKey?.length || 0);
console.log('SUPABASE_SERVICE_KEY prefix:', supabaseServiceKey?.substring(0, 20) + '...');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testConnection() {
  try {
    console.log('\n=== Testing basic connection ===');
    
    // Test 1: Try to fetch a single row from a table that should exist
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('Error fetching from users table:', error);
    } else {
      console.log('Successfully connected to users table');
      console.log('Found', data?.length || 0, 'users');
    }
    
    // Test 2: Try to fetch from scan_history table
    const { data: scanData, error: scanError } = await supabase
      .from('scan_history')
      .select('scan_id')
      .limit(1);
    
    if (scanError) {
      console.error('Error fetching from scan_history table:', scanError);
    } else {
      console.log('Successfully connected to scan_history table');
      console.log('Found', scanData?.length || 0, 'scan records');
    }
    
    // Test 3: Try to fetch from email_data table
    const { data: emailData, error: emailError } = await supabase
      .from('email_data')
      .select('id')
      .limit(1);
    
    if (emailError) {
      console.error('Error fetching from email_data table:', emailError);
    } else {
      console.log('Successfully connected to email_data table');
      console.log('Found', emailData?.length || 0, 'email records');
    }
    
    console.log('\n=== Connection test completed ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testConnection(); 