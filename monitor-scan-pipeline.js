#!/usr/bin/env node

/**
 * Scan Pipeline Monitor
 * 
 * Real-time monitoring and debugging tool for the email scanning pipeline
 * 
 * Usage:
 *   node monitor-scan-pipeline.js [--watch] [--user=email] [--scan=scan_id] [--last=5]
 * 
 * Options:
 *   --watch      Continuously monitor for changes (refreshes every 5 seconds)
 *   --user       Filter by specific user email
 *   --scan       Monitor specific scan ID
 *   --last       Number of recent scans to show (default: 5)
 *   --verbose    Show detailed information
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  watch: args.includes('--watch'),
  verbose: args.includes('--verbose'),
  user: args.find(arg => arg.startsWith('--user='))?.split('=')[1],
  scan: args.find(arg => arg.startsWith('--scan='))?.split('=')[1],
  last: parseInt(args.find(arg => arg.startsWith('--last='))?.split('=')[1] || '5')
};

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',     // Cyan
    success: '\x1b[32m',  // Green
    error: '\x1b[31m',    // Red
    warning: '\x1b[33m',  // Yellow
    debug: '\x1b[35m'     // Magenta
  };
  const reset = '\x1b[0m';
  const color = colors[level] || colors.info;
  
  console.log(`${color}[${timestamp}]${reset} ${message}`);
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStatusEmoji(status) {
  const emojis = {
    pending: '⏳',
    in_progress: '🔄',
    ready_for_analysis: '📊',
    analyzing: '🤖',
    completed: '✅',
    failed: '❌'
  };
  return emojis[status] || '❓';
}

async function getScanOverview() {
  let query = supabase
    .from('scan_history')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.scan) {
    query = query.eq('scan_id', options.scan);
  } else {
    query = query.limit(options.last);
  }

  const { data: scans, error } = await query;
  
  if (error) {
    log(`Database error: ${error.message}`, 'error');
    return [];
  }

  // If filtering by user, get user ID first
  if (options.user && scans.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', `%${options.user}%`);
    
    if (users && users.length > 0) {
      const userIds = users.map(u => u.id);
      return scans.filter(scan => userIds.includes(scan.user_id));
    }
    return [];
  }

  return scans;
}

async function getEmailDataStats(scanId) {
  const { data, error } = await supabase
    .from('email_data')
    .select('id, subject, sender, content')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return { count: 0, samples: [] };

  const withContent = data.filter(email => email.content && email.content.length > 10);
  
  return {
    count: data.length,
    withContent: withContent.length,
    samples: data.slice(0, 3).map(email => ({
      subject: email.subject?.substring(0, 50) + '...',
      sender: email.sender,
      hasContent: email.content && email.content.length > 10
    }))
  };
}

async function getAnalysisStats(scanId) {
  const { data, error } = await supabase
    .from('subscription_analysis')
    .select('id, subscription_name, analysis_status, confidence_score, price')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false });

  if (error) return { count: 0, byStatus: {}, samples: [] };

  const byStatus = data.reduce((acc, item) => {
    acc[item.analysis_status] = (acc[item.analysis_status] || 0) + 1;
    return acc;
  }, {});

  const withSubscriptions = data.filter(item => 
    item.subscription_name && 
    item.subscription_name.length > 0 &&
    parseFloat(item.price || 0) > 0
  );

  return {
    count: data.length,
    byStatus,
    withSubscriptions: withSubscriptions.length,
    samples: withSubscriptions.slice(0, 3).map(item => ({
      name: item.subscription_name,
      price: parseFloat(item.price || 0),
      confidence: item.confidence_score || 0
    }))
  };
}

async function getSubscriptionStats(userId) {
  const { data: directSubs } = await supabase
    .from('subscriptions')
    .select('id, name, price, is_manual')
    .eq('user_id', userId);

  const { data: analysisSubs } = await supabase
    .from('subscription_analysis')
    .select('id, subscription_name, price, analysis_status')
    .eq('user_id', userId)
    .eq('analysis_status', 'completed')
    .not('subscription_name', 'is', null);

  return {
    direct: directSubs?.length || 0,
    fromAnalysis: analysisSubs?.length || 0,
    manual: directSubs?.filter(sub => sub.is_manual)?.length || 0,
    auto: directSubs?.filter(sub => !sub.is_manual)?.length || 0
  };
}

async function displayScanDetails() {
  console.clear();
  log('📊 Scan Pipeline Monitor', 'info');
  log('=' .repeat(80), 'info');

  if (options.scan) {
    log(`🎯 Monitoring scan: ${options.scan}`, 'info');
  } else if (options.user) {
    log(`👤 Filtering by user: ${options.user}`, 'info');
  } else {
    log(`📈 Showing last ${options.last} scans`, 'info');
  }

  const scans = await getScanOverview();

  if (scans.length === 0) {
    log('No scans found matching criteria', 'warning');
    return;
  }

  for (const scan of scans) {
    const status = getStatusEmoji(scan.status);
    const progress = scan.progress || 0;
    const duration = scan.completed_at 
      ? new Date(scan.completed_at) - new Date(scan.created_at)
      : Date.now() - new Date(scan.created_at);

    log(`\n${status} Scan: ${scan.scan_id}`, 'info');
    log(`   Status: ${scan.status} (${progress}%)`, 'info');
    log(`   Duration: ${formatDuration(duration)}`, 'info');
    log(`   Created: ${new Date(scan.created_at).toLocaleString()}`, 'info');

    if (scan.error_message) {
      log(`   Error: ${scan.error_message}`, 'error');
    }

    if (options.verbose) {
      // Get detailed stats
      const emailStats = await getEmailDataStats(scan.scan_id);
      const analysisStats = await getAnalysisStats(scan.scan_id);
      const subscriptionStats = await getSubscriptionStats(scan.user_id);

      log(`   📧 Email Data: ${emailStats.count} total, ${emailStats.withContent} with content`, 'debug');
      
      if (emailStats.samples.length > 0) {
        log('   📧 Sample emails:', 'debug');
        emailStats.samples.forEach(sample => {
          log(`      - ${sample.subject} (${sample.sender}) ${sample.hasContent ? '✓' : '✗'}`, 'debug');
        });
      }

      log(`   🤖 Analysis: ${analysisStats.count} total, ${analysisStats.withSubscriptions} with subscriptions`, 'debug');
      
      if (Object.keys(analysisStats.byStatus).length > 0) {
        log('   🤖 Analysis status:', 'debug');
        Object.entries(analysisStats.byStatus).forEach(([status, count]) => {
          log(`      - ${status}: ${count}`, 'debug');
        });
      }

      if (analysisStats.samples.length > 0) {
        log('   🤖 Found subscriptions:', 'debug');
        analysisStats.samples.forEach(sample => {
          log(`      - ${sample.name}: $${sample.price} (${(sample.confidence * 100).toFixed(0)}% confidence)`, 'debug');
        });
      }

      log(`   💳 Subscriptions: ${subscriptionStats.direct} direct, ${subscriptionStats.fromAnalysis} from analysis`, 'debug');
      log(`   💳 Types: ${subscriptionStats.manual} manual, ${subscriptionStats.auto} auto-detected`, 'debug');
    }
  }

  log(`\n📊 Summary: ${scans.length} scans monitored`, 'info');
  const statusCounts = scans.reduce((acc, scan) => {
    acc[scan.status] = (acc[scan.status] || 0) + 1;
    return acc;
  }, {});

  Object.entries(statusCounts).forEach(([status, count]) => {
    log(`   ${getStatusEmoji(status)} ${status}: ${count}`, 'info');
  });

  if (options.watch) {
    log('\n🔄 Refreshing in 5 seconds... (Press Ctrl+C to stop)', 'info');
  }
}

async function main() {
  log('🚀 Starting scan pipeline monitor...', 'success');

  if (options.watch) {
    // Set up continuous monitoring
    const refresh = async () => {
      try {
        await displayScanDetails();
      } catch (error) {
        log(`Monitor error: ${error.message}`, 'error');
      }
    };

    // Initial display
    await refresh();

    // Set up interval
    const interval = setInterval(refresh, 5000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      log('\n👋 Monitoring stopped', 'info');
      clearInterval(interval);
      process.exit(0);
    });

  } else {
    // Single run
    try {
      await displayScanDetails();
    } catch (error) {
      log(`Monitor error: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Scan Pipeline Monitor

Usage: node monitor-scan-pipeline.js [options]

Options:
  --watch           Continuously monitor for changes
  --user=email      Filter by specific user email
  --scan=scan_id    Monitor specific scan ID
  --last=N          Number of recent scans to show (default: 5)
  --verbose         Show detailed information
  --help, -h        Show this help message

Examples:
  node monitor-scan-pipeline.js
  node monitor-scan-pipeline.js --watch --verbose
  node monitor-scan-pipeline.js --user=john@example.com
  node monitor-scan-pipeline.js --scan=scan_abc123 --verbose
`);
  process.exit(0);
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
