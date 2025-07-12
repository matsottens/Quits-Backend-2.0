#!/usr/bin/env node

// Debug script to monitor scan issues
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkGeminiQuota() {
  console.log('\n=== Checking Gemini API Quota ===');
  
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ GEMINI_API_KEY not configured');
    return;
  }

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Hello, quota test'
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 10,
        }
      })
    });

    if (response.ok) {
      console.log('✅ Gemini API quota available');
      
      // Check quota headers
      const quotaHeaders = {};
      ['x-quota-user', 'x-ratelimit-remaining', 'x-ratelimit-reset'].forEach(header => {
        if (response.headers.get(header)) {
          quotaHeaders[header] = response.headers.get(header);
        }
      });
      
      if (Object.keys(quotaHeaders).length > 0) {
        console.log('📊 Quota headers:', quotaHeaders);
      }
    } else {
      const errorData = await response.json();
      console.log('❌ Gemini API quota issue:', errorData.error?.status || response.status);
    }
  } catch (error) {
    console.log('❌ Error checking Gemini quota:', error.message);
  }
}

async function checkRecentScans() {
  console.log('\n=== Recent Scan Status ===');
  
  try {
    const { data: scans, error } = await supabase
      .from('scan_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.log('❌ Error fetching scans:', error.message);
      return;
    }

    if (!scans || scans.length === 0) {
      console.log('📭 No scans found');
      return;
    }

    scans.forEach((scan, index) => {
      console.log(`\n${index + 1}. Scan ID: ${scan.scan_id}`);
      console.log(`   Status: ${scan.status}`);
      console.log(`   Progress: ${scan.progress || 0}%`);
      console.log(`   Emails: ${scan.emails_found || 0} found, ${scan.emails_processed || 0} processed`);
      console.log(`   Subscriptions: ${scan.subscriptions_found || 0}`);
      console.log(`   Created: ${new Date(scan.created_at).toLocaleString()}`);
      if (scan.error_message) {
        console.log(`   Error: ${scan.error_message}`);
      }
    });
  } catch (error) {
    console.log('❌ Error checking scans:', error.message);
  }
}

async function checkSubscriptionAnalysis() {
  console.log('\n=== Subscription Analysis Status ===');
  
  try {
    const { data: analysis, error } = await supabase
      .from('subscription_analysis')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.log('❌ Error fetching analysis:', error.message);
      return;
    }

    if (!analysis || analysis.length === 0) {
      console.log('📭 No analysis records found');
      return;
    }

    // Group by status
    const byStatus = analysis.reduce((acc, item) => {
      const status = item.analysis_status || 'unknown';
      if (!acc[status]) acc[status] = [];
      acc[status].push(item);
      return acc;
    }, {});

    Object.entries(byStatus).forEach(([status, items]) => {
      console.log(`\n${status.toUpperCase()}: ${items.length} items`);
      items.slice(0, 3).forEach(item => {
        console.log(`  - ${item.subscription_name || 'Unknown'} (${item.confidence_score || 'N/A'})`);
      });
      if (items.length > 3) {
        console.log(`  ... and ${items.length - 3} more`);
      }
    });
  } catch (error) {
    console.log('❌ Error checking analysis:', error.message);
  }
}

async function checkQuotaExhaustedScans() {
  console.log('\n=== Quota Exhausted Scans ===');
  
  try {
    const { data: scans, error } = await supabase
      .from('scan_history')
      .select('*')
      .eq('status', 'quota_exhausted')
      .order('created_at', { ascending: false });

    if (error) {
      console.log('❌ Error fetching quota exhausted scans:', error.message);
      return;
    }

    if (!scans || scans.length === 0) {
      console.log('✅ No quota exhausted scans found');
      return;
    }

    console.log(`⚠️  Found ${scans.length} scans with quota exhaustion:`);
    scans.forEach((scan, index) => {
      console.log(`\n${index + 1}. Scan ID: ${scan.scan_id}`);
      console.log(`   Created: ${new Date(scan.created_at).toLocaleString()}`);
      console.log(`   Error: ${scan.error_message || 'No error message'}`);
    });
  } catch (error) {
    console.log('❌ Error checking quota exhausted scans:', error.message);
  }
}

async function main() {
  console.log('🔍 Quits 2.0 Scan Debug Tool');
  console.log('============================');
  
  await checkGeminiQuota();
  await checkRecentScans();
  await checkSubscriptionAnalysis();
  await checkQuotaExhaustedScans();
  
  console.log('\n✅ Debug check complete');
}

main().catch(console.error); 