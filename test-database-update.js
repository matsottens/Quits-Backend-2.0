// Test script to directly test database update functionality
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('Please set it with: export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testDatabaseUpdate() {
  console.log('🧪 Testing Database Update Functionality\n');

  try {
    // Step 1: Get a test user
    console.log('1. Getting a test user...');
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email, scan_frequency')
      .limit(1);

    if (userError) {
      console.error('❌ Error fetching users:', userError);
      return;
    }

    if (!users || users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }

    const testUser = users[0];
    console.log('✅ Test user found:', { id: testUser.id, email: testUser.email, scan_frequency: testUser.scan_frequency });

    // Step 2: Update scan_frequency
    console.log('\n2. Updating scan_frequency to "daily"...');
    const { data: updateResult, error: updateError } = await supabase
      .from('users')
      .update({ scan_frequency: 'daily' })
      .eq('id', testUser.id)
      .select();

    if (updateError) {
      console.error('❌ Error updating scan_frequency:', updateError);
      return;
    }

    console.log('✅ Update successful:', updateResult[0]);

    // Step 3: Verify the update
    console.log('\n3. Verifying the update...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('users')
      .select('id, email, scan_frequency')
      .eq('id', testUser.id)
      .single();

    if (verifyError) {
      console.error('❌ Error verifying update:', verifyError);
      return;
    }

    console.log('✅ Verification successful:', verifyData);

    if (verifyData.scan_frequency === 'daily') {
      console.log('🎉 Database update test PASSED!');
    } else {
      console.log('❌ Database update test FAILED! Expected "daily", got:', verifyData.scan_frequency);
    }

    // Step 4: Test the settings API format
    console.log('\n4. Testing settings API format...');
    const allAccounts = [verifyData.email, ...([])];
    const uniqueAccounts = [...new Set(allAccounts)];

    const settings = {
      email: {
        accounts: uniqueAccounts,
        scanFrequency: verifyData.scan_frequency || 'manual',
      },
    };

    console.log('✅ Settings format:', settings);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDatabaseUpdate(); 