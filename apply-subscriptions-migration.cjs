// Script to apply subscriptions table migration to Supabase
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Get Supabase configuration from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseKey ? `${supabaseKey.substring(0, 10)}...` : 'undefined');

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be defined in .env file');
  process.exit(1);
}

// Create Supabase client with the service role key (full admin access)
const supabase = createClient(supabaseUrl, supabaseKey);

// Read the SQL migration file
const sqlContent = fs.readFileSync('./supabase/migrations/20240423_create_subscriptions_table.sql', 'utf8');
console.log('SQL content loaded, length:', sqlContent.length);

async function applyMigration() {
  console.log('Applying subscriptions table migration to Supabase...');
  
  try {
    // Execute the SQL migration
    const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      console.error('Error applying migration:', error);
      
      // Fallback: show the SQL to be executed manually
      console.log('\nDirect SQL execution failed. Please execute the following SQL manually:');
      console.log('\n-------- SQL MIGRATION SCRIPT --------\n');
      console.log(sqlContent);
      console.log('\n--------------------------------------\n');
      
      console.log('Instructions:');
      console.log('1. Go to https://app.supabase.com/project/{PROJECT_ID}/sql/new');
      console.log('2. Paste the SQL above into the editor');
      console.log('3. Click "Run" to execute the migration');
    } else {
      console.log('Migration applied successfully!');
      console.log('Data:', data);
    }
  } catch (error) {
    console.error('Error:', error);
    
    // Fallback: show the SQL to be executed manually
    console.log('\nError occurred. Please execute the following SQL manually:');
    console.log('\n-------- SQL MIGRATION SCRIPT --------\n');
    console.log(sqlContent);
    console.log('\n--------------------------------------\n');
    
    console.log('Instructions:');
    console.log('1. Go to https://app.supabase.com/project/{PROJECT_ID}/sql/new');
    console.log('2. Paste the SQL above into the editor');
    console.log('3. Click "Run" to execute the migration');
  }
}

applyMigration(); 