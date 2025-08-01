import { supabase } from './utils/supabase.js';

// This endpoint will be called by a cron job to trigger scans based on user preferences
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Determine frequency based on cron schedule
  let frequency = 'daily';
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // If it's Sunday (day 0), this is the weekly cron job
  if (dayOfWeek === 0) {
    frequency = 'weekly';
  }
  
  console.log(`Scheduled scan triggered for frequency: ${frequency} (day of week: ${dayOfWeek})`);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {

    console.log(`Scheduled scan triggered for frequency: ${frequency}`);

    // Get users who have this scan frequency enabled
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email, scan_frequency')
      .eq('scan_frequency', frequency);

    if (userError) {
      console.error('Error fetching users:', userError);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    console.log(`Found ${users?.length || 0} users with ${frequency} scan frequency`);

    if (!users || users.length === 0) {
      return res.status(200).json({ message: 'No users found for this frequency' });
    }

    // For each user, check if they need a scan based on their last scan
    const scanPromises = users.map(async (user) => {
      try {
        // Check if user has a recent scan (within the frequency period)
        const now = new Date();
        let cutoffDate;
        
        if (frequency === 'daily') {
          cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
        } else if (frequency === 'weekly') {
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        }

        // Check for recent scans
        const { data: recentScans, error: scanError } = await supabase
          .from('scan_history')
          .select('id, created_at, status')
          .eq('user_id', user.id)
          .gte('created_at', cutoffDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        if (scanError) {
          console.error(`Error checking recent scans for user ${user.id}:`, scanError);
          return { userId: user.id, status: 'error', error: scanError.message };
        }

        // If user has a recent scan that's not failed, skip
        if (recentScans && recentScans.length > 0) {
          const lastScan = recentScans[0];
          if (lastScan.status !== 'failed' && lastScan.status !== 'error') {
            console.log(`User ${user.id} has recent scan (${lastScan.status}), skipping`);
            return { userId: user.id, status: 'skipped', reason: 'recent_scan_exists' };
          }
        }

        // Check if user has Gmail tokens
        const { data: tokens, error: tokenError } = await supabase
          .from('user_tokens')
          .select('access_token, refresh_token')
          .eq('user_id', user.id)
          .single();

        if (tokenError || !tokens?.access_token) {
          console.log(`User ${user.id} has no Gmail tokens, skipping`);
          return { userId: user.id, status: 'skipped', reason: 'no_gmail_tokens' };
        }

        // Trigger a scan for this user
        console.log(`Triggering scan for user ${user.id} (${user.email})`);
        
        // Create a scan record
        const { data: scanRecord, error: createError } = await supabase
          .from('scan_history')
          .insert({
            scan_id: `scheduled_${Date.now()}_${user.id}`,
            user_id: user.id,
            status: 'pending',
            use_real_data: true,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error(`Error creating scan record for user ${user.id}:`, createError);
          return { userId: user.id, status: 'error', error: createError.message };
        }

        // Trigger the scan processing
        try {
          const scanPort = process.env.PORT || 3000;
          const scanUrl = `http://localhost:${scanPort}/api/email/scan`;
          
          // Make an internal request to trigger the scan
          const response = await fetch(scanUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tokens.access_token}`,
              'X-User-ID': user.id,
              'X-Scan-ID': scanRecord.scan_id
            },
            body: JSON.stringify({
              useRealData: true,
              scheduled: true
            })
          });

          if (response.ok) {
            console.log(`Successfully triggered scan for user ${user.id}`);
            return { userId: user.id, status: 'triggered', scanId: scanRecord.scan_id };
          } else {
            console.error(`Failed to trigger scan for user ${user.id}:`, response.status);
            return { userId: user.id, status: 'error', error: `HTTP ${response.status}` };
          }
        } catch (triggerError) {
          console.error(`Error triggering scan for user ${user.id}:`, triggerError);
          return { userId: user.id, status: 'error', error: triggerError.message };
        }

      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
        return { userId: user.id, status: 'error', error: error.message };
      }
    });

    const results = await Promise.all(scanPromises);
    
    const summary = {
      frequency,
      totalUsers: users.length,
      triggered: results.filter(r => r.status === 'triggered').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results
    };

    console.log('Scheduled scan summary:', summary);
    
    return res.status(200).json(summary);

  } catch (error) {
    console.error('Error in scheduled scan:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
} 