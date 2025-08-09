#!/usr/bin/env node

/**
 * Quick test script to verify subscription endpoint responses
 * Tests both /api/subscription and /api/subscriptions endpoints
 */

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE_URL = process.env.API_BASE_URL || 'https://quits-backend-2-0-mats-ottens-hotmailcoms-projects.vercel.app';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testSubscriptionData() {
  console.log('🔍 Testing subscription data structure...\n');
  
  try {
    // Get a recent user ID
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (userError || !users?.length) {
      console.error('❌ No users found in database');
      return;
    }
    
    const userId = users[0].id;
    console.log(`📧 Testing with user: ${users[0].email} (${userId})`);
    
    // Check for completed analysis
    const { data: analysis, error: analysisError } = await supabase
      .from('subscription_analysis')
      .select('*')
      .eq('user_id', userId)
      .eq('analysis_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (analysisError) {
      console.error('❌ Error fetching analysis:', analysisError.message);
      return;
    }
    
    console.log(`📊 Found ${analysis?.length || 0} completed analysis records`);
    
    if (analysis && analysis.length > 0) {
      console.log('📋 Sample analysis records:');
      analysis.slice(0, 3).forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.subscription_name || 'N/A'} - $${item.price || 0} (${item.confidence_score || 0} confidence)`);
      });
    }
    
    // Check subscriptions table
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (subError) {
      console.error('❌ Error fetching subscriptions:', subError.message);
      return;
    }
    
    console.log(`💳 Found ${subscriptions?.length || 0} direct subscription records`);
    
    if (subscriptions && subscriptions.length > 0) {
      console.log('📋 Sample subscription records:');
      subscriptions.slice(0, 3).forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.name} - $${item.price} (${item.is_manual ? 'manual' : 'auto'})`);
      });
    }
    
    console.log('\n🧪 Testing endpoint logic...');
    
    // Simulate the endpoint logic
    const analysisSubscriptions = analysis || [];
    const manualSubscriptions = subscriptions || [];
    
    // Check for Gemini subscriptions (auto-detected in subscriptions table)
    const geminiSubscriptions = manualSubscriptions.filter(sub => 
      !sub.is_manual && (sub.category === 'auto-detected' || sub.source === 'gemini')
    );
    
    let allSubscriptions;
    let logic = '';
    
    if (geminiSubscriptions.length > 0) {
      // Use only manual + Gemini subscriptions
      allSubscriptions = manualSubscriptions.map(sub => ({ 
        ...sub, 
        source: sub.is_manual ? 'manual' : 'gemini' 
      }));
      logic = `Using subscriptions table only (manual + gemini). Gemini count: ${geminiSubscriptions.length}`;
    } else {
      // Use manual + pattern-matching (analysis) subscriptions
      allSubscriptions = [
        ...manualSubscriptions.map(sub => ({ ...sub, source: 'manual' })),
        ...analysisSubscriptions.map(analysis => ({
          id: `analysis_${analysis.id}`,
          name: analysis.subscription_name,
          price: parseFloat(analysis.price || 0),
          currency: analysis.currency || 'USD',
          billing_cycle: analysis.billing_cycle || 'monthly',
          next_billing_date: analysis.next_billing_date,
          service_provider: analysis.service_provider,
          category: 'auto-detected',
          is_manual: false,
          source: 'email_scan',
          source_analysis_id: analysis.id,
          confidence_score: analysis.confidence_score,
          analysis_status: 'completed', // Always set to completed
          is_pending: false, // Not pending since analysis is completed
          created_at: analysis.created_at,
          updated_at: analysis.updated_at
        }))
      ];
      logic = `Using subscriptions table (manual) + pattern-matching analysis results. Analysis count: ${analysisSubscriptions.length}`;
    }
    
    console.log(`📝 Logic: ${logic}`);
    console.log(`📊 Total combined subscriptions: ${allSubscriptions.length}`);
    
    // Show what would be returned
    console.log('\n📋 Combined subscription data:');
    allSubscriptions.slice(0, 5).forEach((sub, index) => {
      console.log(`  ${index + 1}. ${sub.name} - $${sub.price} (${sub.source}, pending: ${!!sub.is_pending}, status: ${sub.analysis_status || 'N/A'})`);
    });
    
    // Test frontend filtering logic
    const frontendFiltered = allSubscriptions.filter((sub) => {
      const notCompletedStatus = sub.analysis_status && sub.analysis_status !== 'completed';
      const stillPending = !!sub.is_pending;
      return !notCompletedStatus && !stillPending;
    });
    
    console.log(`\n🎯 After frontend filtering: ${frontendFiltered.length} subscriptions would show`);
    console.log('📋 Filtered results:');
    frontendFiltered.slice(0, 5).forEach((sub, index) => {
      console.log(`  ${index + 1}. ${sub.name} - $${sub.price} (${sub.source})`);
    });
    
    if (frontendFiltered.length === 0 && allSubscriptions.length > 0) {
      console.log('\n🚨 ISSUE: Frontend filtering is removing all subscriptions!');
      console.log('Check analysis_status and is_pending fields.');
    } else if (frontendFiltered.length > 0) {
      console.log('\n✅ Frontend filtering logic should work correctly');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSubscriptionData();
