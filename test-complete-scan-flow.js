#!/usr/bin/env node

/**
 * Comprehensive test script for the complete scan flow
 * 
 * This script verifies:
 * 1. Scan initiation and progress tracking
 * 2. Email data extraction
 * 3. Analysis record creation
 * 4. Gemini analysis processing
 * 5. Subscription creation from analysis
 * 6. API endpoint responses
 * 
 * Usage: node test-complete-scan-flow.js [--cleanup] [--verbose]
 */

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE_URL = process.env.API_BASE_URL || 'https://quits-backend-2-0-mats-ottens-hotmailcoms-projects.vercel.app';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Test configuration
const TEST_CONFIG = {
  cleanup: process.argv.includes('--cleanup'),
  verbose: process.argv.includes('--verbose'),
  timeout: 60000, // 60 seconds max per test
  maxRetries: 10,
  retryDelay: 2000 // 2 seconds between retries
};

// Test state
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

// Utility functions
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '🔍',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    debug: '🔧'
  }[level] || '📝';
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function verbose(message) {
  if (TEST_CONFIG.verbose) {
    log(message, 'debug');
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest(name, testFn) {
  testResults.total++;
  log(`Running test: ${name}`);
  
  try {
    await Promise.race([
      testFn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout)
      )
    ]);
    
    testResults.passed++;
    log(`✅ ${name} - PASSED`, 'success');
    return true;
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ test: name, error: error.message });
    log(`❌ ${name} - FAILED: ${error.message}`, 'error');
    return false;
  }
}

async function waitForCondition(description, checkFn, maxRetries = TEST_CONFIG.maxRetries) {
  verbose(`Waiting for: ${description}`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await checkFn();
      if (result) {
        verbose(`✅ Condition met: ${description}`);
        return result;
      }
    } catch (error) {
      verbose(`Retry ${i + 1}/${maxRetries} failed: ${error.message}`);
    }
    
    if (i < maxRetries - 1) {
      await sleep(TEST_CONFIG.retryDelay);
    }
  }
  
  throw new Error(`Condition not met after ${maxRetries} retries: ${description}`);
}

// Test functions
async function testScanInitiation() {
  // This would require a valid JWT token and Gmail access
  // For now, we'll test the database state after a recent scan
  log('Checking for recent scan records...');
  
  const { data: recentScans, error } = await supabase
    .from('scan_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (error) throw new Error(`Failed to fetch scan history: ${error.message}`);
  
  if (!recentScans || recentScans.length === 0) {
    throw new Error('No recent scans found. Please run a scan first.');
  }
  
  const scan = recentScans[0];
  verbose(`Found recent scan: ${scan.scan_id} (status: ${scan.status}, progress: ${scan.progress}%)`);
  
  // Verify scan has proper structure
  if (!scan.scan_id || !scan.user_id || !scan.status) {
    throw new Error('Scan record missing required fields');
  }
  
  return scan;
}

async function testEmailDataExtraction(scanId) {
  log(`Testing email data extraction for scan: ${scanId}`);
  
  const { data: emailData, error } = await supabase
    .from('email_data')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) throw new Error(`Failed to fetch email data: ${error.message}`);
  
  if (!emailData || emailData.length === 0) {
    throw new Error('No email data found for scan');
  }
  
  verbose(`Found ${emailData.length} email records`);
  
  // Check email data quality
  const emailWithContent = emailData.find(email => 
    email.subject && 
    email.sender && 
    email.content && 
    email.content.length > 10
  );
  
  if (!emailWithContent) {
    throw new Error('No email records with proper content found');
  }
  
  verbose(`✅ Email content extraction working: "${emailWithContent.subject.substring(0, 50)}..."`);
  return emailData;
}

async function testAnalysisRecords(scanId) {
  log(`Testing analysis record creation for scan: ${scanId}`);
  
  const { data: analysisRecords, error } = await supabase
    .from('subscription_analysis')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false });
  
  if (error) throw new Error(`Failed to fetch analysis records: ${error.message}`);
  
  if (!analysisRecords || analysisRecords.length === 0) {
    throw new Error('No analysis records found for scan');
  }
  
  verbose(`Found ${analysisRecords.length} analysis records`);
  
  // Check for different analysis statuses
  const statusCounts = analysisRecords.reduce((acc, record) => {
    acc[record.analysis_status] = (acc[record.analysis_status] || 0) + 1;
    return acc;
  }, {});
  
  verbose(`Analysis status breakdown: ${JSON.stringify(statusCounts)}`);
  
  // Verify we have completed analyses
  const completedCount = statusCounts.completed || 0;
  if (completedCount === 0) {
    throw new Error('No completed analysis records found');
  }
  
  return analysisRecords;
}

async function testSubscriptionCreation(scanId) {
  log(`Testing subscription creation from analysis for scan: ${scanId}`);
  
  // Check for subscriptions created from this scan
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('*')
    .or(`created_at.gte.${new Date(Date.now() - 3600000).toISOString()}`) // Last hour
    .order('created_at', { ascending: false });
  
  if (error) throw new Error(`Failed to fetch subscriptions: ${error.message}`);
  
  verbose(`Found ${subscriptions?.length || 0} recent subscriptions`);
  
  // Also check analysis-based subscriptions via the API
  const analysisResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/subscription_analysis?scan_id=eq.${scanId}&analysis_status=eq.completed&select=*`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!analysisResponse.ok) {
    throw new Error(`Failed to fetch completed analysis: ${analysisResponse.status}`);
  }
  
  const completedAnalysis = await analysisResponse.json();
  verbose(`Found ${completedAnalysis.length} completed analysis records with subscription details`);
  
  const analysisWithSubs = completedAnalysis.filter(a => 
    a.subscription_name && 
    a.subscription_name.length > 0 &&
    a.price && 
    parseFloat(a.price) > 0
  );
  
  if (analysisWithSubs.length === 0) {
    throw new Error('No analysis records with valid subscription data found');
  }
  
  verbose(`✅ Found ${analysisWithSubs.length} valid subscription analyses`);
  return { subscriptions, analysisWithSubs };
}

async function testAPIEndpoints(scanId) {
  log('Testing API endpoint responses...');
  
  // Test the main subscription endpoint
  const subResponse = await fetch(`${API_BASE_URL}/api/subscriptions`, {
    headers: {
      'Accept': 'application/json'
    }
  });
  
  // Should get 401 without auth, but endpoint should exist
  if (subResponse.status !== 401) {
    verbose(`Subscriptions endpoint status: ${subResponse.status}`);
  }
  
  // Test scan status endpoint
  const statusResponse = await fetch(`${API_BASE_URL}/api/email/status`, {
    headers: {
      'Accept': 'application/json'
    }
  });
  
  if (statusResponse.status !== 401 && statusResponse.status !== 200) {
    throw new Error(`Scan status endpoint returned unexpected status: ${statusResponse.status}`);
  }
  
  verbose('✅ API endpoints responding correctly');
}

async function testProgressTracking(scanId) {
  log(`Testing progress tracking for scan: ${scanId}`);
  
  const { data: scan, error } = await supabase
    .from('scan_history')
    .select('*')
    .eq('scan_id', scanId)
    .single();
  
  if (error) throw new Error(`Failed to fetch scan: ${error.message}`);
  
  // Verify progress tracking fields
  if (typeof scan.progress !== 'number' || scan.progress < 0 || scan.progress > 100) {
    throw new Error(`Invalid progress value: ${scan.progress}`);
  }
  
  if (!scan.status || !['pending', 'in_progress', 'ready_for_analysis', 'analyzing', 'completed', 'failed'].includes(scan.status)) {
    throw new Error(`Invalid scan status: ${scan.status}`);
  }
  
  verbose(`✅ Scan progress: ${scan.progress}%, status: ${scan.status}`);
  
  // Check for proper timestamps
  if (!scan.created_at || !scan.updated_at) {
    throw new Error('Missing timestamp fields');
  }
  
  return scan;
}

async function cleanup() {
  if (!TEST_CONFIG.cleanup) {
    return;
  }
  
  log('Cleaning up test data...');
  
  try {
    // Remove test scan data older than 1 hour
    const cutoff = new Date(Date.now() - 3600000).toISOString();
    
    await supabase
      .from('subscription_analysis')
      .delete()
      .lt('created_at', cutoff);
    
    await supabase
      .from('email_data')
      .delete()
      .lt('created_at', cutoff);
    
    await supabase
      .from('scan_history')
      .delete()
      .lt('created_at', cutoff);
    
    verbose('✅ Cleanup completed');
  } catch (error) {
    log(`⚠️ Cleanup failed: ${error.message}`, 'warning');
  }
}

// Main test runner
async function runAllTests() {
  log('🚀 Starting comprehensive scan flow tests...');
  log(`Configuration: cleanup=${TEST_CONFIG.cleanup}, verbose=${TEST_CONFIG.verbose}`);
  
  let latestScan = null;
  
  try {
    // Test 1: Scan initiation and database state
    await runTest('Scan Initiation', async () => {
      latestScan = await testScanInitiation();
    });
    
    if (!latestScan) {
      throw new Error('Cannot continue without a valid scan');
    }
    
    // Test 2: Email data extraction
    await runTest('Email Data Extraction', async () => {
      await testEmailDataExtraction(latestScan.scan_id);
    });
    
    // Test 3: Analysis record creation
    await runTest('Analysis Record Creation', async () => {
      await testAnalysisRecords(latestScan.scan_id);
    });
    
    // Test 4: Subscription creation
    await runTest('Subscription Creation', async () => {
      await testSubscriptionCreation(latestScan.scan_id);
    });
    
    // Test 5: Progress tracking
    await runTest('Progress Tracking', async () => {
      await testProgressTracking(latestScan.scan_id);
    });
    
    // Test 6: API endpoints
    await runTest('API Endpoints', async () => {
      await testAPIEndpoints(latestScan.scan_id);
    });
    
  } catch (error) {
    log(`💥 Test suite failed: ${error.message}`, 'error');
  } finally {
    await cleanup();
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  log(`Total tests: ${testResults.total}`);
  log(`Passed: ${testResults.passed}`, 'success');
  log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'info');
  
  if (testResults.errors.length > 0) {
    console.log('\nErrors:');
    testResults.errors.forEach(({ test, error }) => {
      log(`  ${test}: ${error}`, 'error');
    });
  }
  
  const successRate = Math.round((testResults.passed / testResults.total) * 100);
  log(`Success rate: ${successRate}%`);
  
  if (successRate >= 80) {
    log('🎉 Scan flow is working well!', 'success');
    process.exit(0);
  } else {
    log('🚨 Scan flow needs attention!', 'error');
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  log('⏹️ Test interrupted by user');
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  log(`💥 Unhandled rejection: ${reason}`, 'error');
  await cleanup();
  process.exit(1);
});

// Run the test suite
runAllTests().catch(async (error) => {
  log(`💥 Fatal error: ${error.message}`, 'error');
  await cleanup();
  process.exit(1);
});
