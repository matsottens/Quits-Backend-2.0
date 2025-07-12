// Script to apply database migrations to Supabase
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
  console.log('Starting subscription_examples table migration...');
  
  try {
    // Create the subscription_examples table
    console.log('Creating subscription_examples table...');
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.subscription_examples (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        service_name TEXT NOT NULL,
        sender_pattern TEXT NOT NULL,
        subject_pattern TEXT NOT NULL,
        amount DECIMAL(10, 2),
        currency TEXT,
        billing_frequency TEXT,
        confidence DECIMAL(3, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // Use the REST API to execute SQL
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql: createTableSQL })
    });

    if (!response.ok) {
      console.log('Direct SQL execution failed, trying alternative approach...');
      
      // Try to create the table using a different approach
      const { error: createError } = await supabase
        .from('subscription_examples')
        .select('*')
        .limit(1);
      
      if (createError && createError.message.includes('does not exist')) {
        console.log('Table does not exist, creating it manually...');
        
        // Since we can't execute DDL through the client, we'll provide instructions
        console.log('\n❌ Cannot create table automatically. Please execute the following SQL manually:');
        console.log('\n-------- SQL TO EXECUTE MANUALLY --------\n');
        console.log(createTableSQL);
        console.log('\n-- Add index');
        console.log('CREATE INDEX IF NOT EXISTS idx_subscription_examples_service_name ON public.subscription_examples(service_name);');
        console.log('\n-- Add comment');
        console.log('COMMENT ON TABLE public.subscription_examples IS \'Stores detected subscription patterns to improve future detection\';');
        console.log('\n-- Enable RLS');
        console.log('ALTER TABLE public.subscription_examples ENABLE ROW LEVEL SECURITY;');
        console.log('\n-- Add policies');
        console.log('CREATE POLICY "Users can view subscription examples" ON public.subscription_examples FOR SELECT USING (true);');
        console.log('CREATE POLICY "API can insert subscription examples" ON public.subscription_examples FOR INSERT WITH CHECK (true);');
        console.log('\n-- Insert initial data');
        console.log(`
INSERT INTO public.subscription_examples (service_name, sender_pattern, subject_pattern, amount, currency, billing_frequency, confidence)
VALUES 
('NBA League Pass', 'NBA <NBA@nbaemail.nba.com>', 'NBA League Pass Subscription Confirmation', 16.99, 'EUR', 'monthly', 0.95),
('Babbel', 'Apple <no_reply@email.apple.com>', 'Your subscription confirmation', 53.99, 'EUR', 'quarterly', 0.95),
('Vercel Premium', 'Vercel Inc. <invoice+statements@vercel.com>', 'Your receipt from Vercel Inc.', 20.00, 'USD', 'monthly', 0.95),
('Ahrefs Starter', 'Ahrefs <billing@ahrefs.com>', 'Thank you for your payment', 27.00, 'EUR', 'monthly', 0.95)
ON CONFLICT (id) DO NOTHING;
        `);
        console.log('\n----------------------------------------\n');
        
        console.log('Instructions:');
        console.log('1. Go to https://app.supabase.com/project/{YOUR_PROJECT_ID}/sql/new');
        console.log('2. Paste the SQL above into the editor');
        console.log('3. Click "Run" to execute the migration');
        console.log('4. Run this script again to verify the table was created');
        
        return;
      }
    }

    // Add index
    console.log('Adding index...');
    const indexSQL = 'CREATE INDEX IF NOT EXISTS idx_subscription_examples_service_name ON public.subscription_examples(service_name);';
    
    try {
      await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceRoleKey,
          'Authorization': `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: indexSQL })
      });
    } catch (indexError) {
      console.log('Index creation failed (may already exist):', indexError.message);
    }

    // Enable RLS
    console.log('Enabling RLS...');
    const rlsSQL = 'ALTER TABLE public.subscription_examples ENABLE ROW LEVEL SECURITY;';
    
    try {
      await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceRoleKey,
          'Authorization': `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: rlsSQL })
      });
    } catch (rlsError) {
      console.log('RLS enable failed (may already be enabled):', rlsError.message);
    }

    // Insert initial data
    console.log('Inserting initial subscription examples...');
    
    const initialData = [
      {
        service_name: 'NBA League Pass',
        sender_pattern: 'NBA <NBA@nbaemail.nba.com>',
        subject_pattern: 'NBA League Pass Subscription Confirmation',
        amount: 16.99,
        currency: 'EUR',
        billing_frequency: 'monthly',
        confidence: 0.95
      },
      {
        service_name: 'Babbel',
        sender_pattern: 'Apple <no_reply@email.apple.com>',
        subject_pattern: 'Your subscription confirmation',
        amount: 53.99,
        currency: 'EUR',
        billing_frequency: 'quarterly',
        confidence: 0.95
      },
      {
        service_name: 'Vercel Premium',
        sender_pattern: 'Vercel Inc. <invoice+statements@vercel.com>',
        subject_pattern: 'Your receipt from Vercel Inc.',
        amount: 20.00,
        currency: 'USD',
        billing_frequency: 'monthly',
        confidence: 0.95
      },
      {
        service_name: 'Ahrefs Starter',
        sender_pattern: 'Ahrefs <billing@ahrefs.com>',
        subject_pattern: 'Thank you for your payment',
        amount: 27.00,
        currency: 'EUR',
        billing_frequency: 'monthly',
        confidence: 0.95
      }
    ];

    const { data: insertData, error: insertError } = await supabase
      .from('subscription_examples')
      .upsert(initialData, { onConflict: 'service_name' });

    if (insertError) {
      console.error('Error inserting initial data:', insertError);
    } else {
      console.log(`✅ Inserted ${insertData?.length || 0} subscription examples`);
    }

    // Verify the table was created
    console.log('\nVerifying table...');
    
    try {
      const { data: examples, error: verifyError } = await supabase
        .from('subscription_examples')
        .select('*')
        .limit(5);
      
      if (verifyError) {
        console.error('❌ Table verification failed:', verifyError.message);
      } else {
        console.log(`✅ subscription_examples table exists and has ${examples?.length || 0} records`);
        if (examples && examples.length > 0) {
          console.log('Sample records:');
          examples.forEach(example => {
            console.log(`  - ${example.service_name} (${example.confidence} confidence)`);
          });
        }
      }
    } catch (checkError) {
      console.error('❌ Error checking table:', checkError.message);
    }
    
    console.log('\n🎉 Migration completed!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration(); 