import dotenv from 'dotenv';

dotenv.config();

console.log('Environment Variables Test:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Not set');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');

// Test the key pattern used in your codebase
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

console.log('Final supabaseKey:', supabaseKey ? 'Set' : 'Not set');

if (supabaseKey) {
  console.log('Key starts with:', supabaseKey.substring(0, 20) + '...');
  console.log('Key contains service_role:', supabaseKey.includes('service_role'));
} 