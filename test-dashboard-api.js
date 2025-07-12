// Test dashboard API to verify subscription_analysis data is being returned
import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const SUPABASE_URL = 'https://dstsluflwxzkwouxcjkh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testDashboardAPI() {
  try {
    console.log('Testing dashboard API...');
    
    // First, get the user ID
    const userResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id,email&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!userResponse.ok) {
      console.error('Failed to fetch user:', await userResponse.text());
      return;
    }
    
    const users = await userResponse.json();
    if (users.length === 0) {
      console.log('No users found in database');
      return;
    }
    
    const userId = users[0].id;
    console.log(`Testing with user ID: ${userId}`);
    
    // Test subscription_analysis query (both pending and completed)
    console.log('\n1. Testing subscription_analysis query...');
    const analysisResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscription_analysis?user_id=eq.${userId}&analysis_status=in.(completed,pending)&select=*`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (analysisResponse.ok) {
      const analysis = await analysisResponse.json();
      console.log(`Found ${analysis.length} analysis records:`);
      analysis.forEach(item => {
        console.log(`- ${item.subscription_name} (${item.analysis_status}) - $${item.price} ${item.currency}`);
      });
    } else {
      console.error('Failed to fetch analysis:', await analysisResponse.text());
    }
    
    // Test regular subscriptions query
    console.log('\n2. Testing subscriptions query...');
    const subscriptionsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=*`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (subscriptionsResponse.ok) {
      const subscriptions = await subscriptionsResponse.json();
      console.log(`Found ${subscriptions.length} subscriptions:`);
      subscriptions.forEach(sub => {
        console.log(`- ${sub.name} - $${sub.price} ${sub.currency || 'USD'}`);
      });
    } else {
      console.error('Failed to fetch subscriptions:', await subscriptionsResponse.text());
    }
    
    console.log('\n3. Summary:');
    console.log('- The dashboard should now show both manual subscriptions and auto-detected ones from analysis');
    console.log('- Pending analysis records will show with "Analyzing..." badge');
    console.log('- Completed analysis records will show with confidence score');
    console.log('- No dependency on Gemini API quota issues');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testDashboardAPI(); 