// Script to apply database migrations to Supabase
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

// Create Supabase client with the service key (full admin access)
const supabase = createClient(supabaseUrl, supabaseKey);

// Read the SQL file
const sqlContent = fs.readFileSync('./supabase-migrations.sql', 'utf8');
console.log('SQL content loaded, length:', sqlContent.length);

async function applyMigration() {
  console.log('Applying database migrations to Supabase...');
  
  try {
    console.log('Direct SQL execution is not supported via the JS API.');
    console.log('Copy and paste the following SQL into the Supabase SQL Editor:');
    console.log('\n-------- SQL MIGRATION SCRIPT --------\n');
    console.log(sqlContent);
    console.log('\n--------------------------------------\n');
    
    console.log('Instructions:');
    console.log('1. Go to https://app.supabase.com/project/{PROJECT_ID}/sql/new');
    console.log('2. Paste the SQL above into the editor');
    console.log('3. Click "Run" to execute the migration');
  } catch (error) {
    console.error('Error:', error);
  }
}

applyMigration(); 