// Script to apply subscriptions table migration to Supabase
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
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

async function applyMigration() {
  console.log('Starting subscription migration...');
  
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'supabase-migrations.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Migration SQL loaded, applying to database...');
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: statement });
          
          if (error) {
            // Some statements might fail if they already exist, which is okay
            if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
              console.log(`Statement ${i + 1} skipped (already exists): ${error.message}`);
            } else {
              console.error(`Statement ${i + 1} failed:`, error.message);
              // Continue with other statements
            }
          } else {
            console.log(`Statement ${i + 1} executed successfully`);
          }
        } catch (execError) {
          console.error(`Error executing statement ${i + 1}:`, execError.message);
          // Continue with other statements
        }
      }
    }
    
    // Verify the tables were created
    console.log('\nVerifying tables...');
    
    const tablesToCheck = [
      'scan_history',
      'email_data', 
      'subscription_analysis',
      'subscription_examples'
    ];
    
    for (const tableName of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (error) {
          console.error(`❌ Table ${tableName} verification failed:`, error.message);
        } else {
          console.log(`✅ Table ${tableName} exists and is accessible`);
        }
      } catch (checkError) {
        console.error(`❌ Error checking table ${tableName}:`, checkError.message);
      }
    }
    
    // Check if subscription_examples has data
    try {
      const { data: examples, error: examplesError } = await supabase
        .from('subscription_examples')
        .select('*');
      
      if (examplesError) {
        console.error('❌ Error checking subscription_examples data:', examplesError.message);
      } else {
        console.log(`✅ subscription_examples table has ${examples?.length || 0} records`);
      }
    } catch (checkError) {
      console.error('❌ Error checking subscription_examples data:', checkError.message);
    }
    
    console.log('\nMigration completed!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration(); 