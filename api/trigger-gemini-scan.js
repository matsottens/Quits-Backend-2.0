import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  console.log('TRIGGER-DEBUG: ===== GEMINI SCAN TRIGGER CALLED =====');
  console.log('TRIGGER-DEBUG: Method:', req.method);
  console.log('TRIGGER-DEBUG: URL:', req.url);
  console.log('TRIGGER-DEBUG: Headers:', Object.keys(req.headers));
  console.log('TRIGGER-DEBUG: Body:', req.body);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    console.log('TRIGGER-DEBUG: Handling OPTIONS preflight request');
    return res.status(204).end();
  }

  // Accept both GET (for cron jobs) and POST (for frontend requests)
  if (req.method !== 'GET' && req.method !== 'POST') {
    console.log('TRIGGER-DEBUG: Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
  }

  try {
    console.log('TRIGGER-DEBUG: Processing', req.method, 'request');
    
    // Check if we have the required environment variables
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('TRIGGER-DEBUG: Missing SUPABASE_SERVICE_ROLE_KEY');
      return res.status(500).json({ error: 'Missing service role key' });
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check for scans that are ready for analysis (exclude completed scans)
    console.log('TRIGGER-DEBUG: Checking for scans ready for analysis...');
    
    // First, let's see what scans exist with debug info
    const { data: allRecentScans, error: debugError } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, status, emails_processed, subscriptions_found, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    console.log('TRIGGER-DEBUG: Recent scans in database:', allRecentScans);
    
    // Now look for scans that need analysis
    let { data: readyScans, error: scanError } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, created_at, emails_processed, subscriptions_found, status')
      .eq('status', 'ready_for_analysis')
      .order('created_at', { ascending: true })
      .limit(5);

    if (scanError) {
      console.error('TRIGGER-DEBUG: Error fetching ready scans:', scanError);
      return res.status(500).json({ error: 'Failed to fetch ready scans', details: scanError.message });
    }

    console.log('TRIGGER-DEBUG: Raw scan query result:', readyScans);
    console.log('TRIGGER-DEBUG: Found', readyScans?.length || 0, 'scans with ready_for_analysis status');

    if (!readyScans || readyScans.length === 0) {
      console.log('TRIGGER-DEBUG: No scans ready for analysis found');
      
      // Check if there are scans that might have been missed
      const { data: completedScansWithoutAnalysis, error: completedError } = await supabase
        .from('scan_history')
        .select('scan_id, status, subscriptions_found, created_at')
        .eq('status', 'completed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false })
        .limit(5);
      
      console.log('TRIGGER-DEBUG: Recent completed scans:', completedScansWithoutAnalysis);
      
      // If we find recent completed scans that might need AI analysis, let's check them
      if (completedScansWithoutAnalysis && completedScansWithoutAnalysis.length > 0) {
        console.log('TRIGGER-DEBUG: Found recent completed scans - checking if they need AI analysis');
        
        // Look for subscription_analysis records for these scans
        for (const scan of completedScansWithoutAnalysis) {
          const { data: analysisRecords, error: analysisError } = await supabase
            .from('subscription_analysis')
            .select('id, analysis_status')
            .eq('scan_id', scan.scan_id);
          
          console.log(`TRIGGER-DEBUG: Scan ${scan.scan_id} has ${analysisRecords?.length || 0} analysis records`);
          
          // If there are pending analysis records, force this scan back to ready_for_analysis
          if (analysisRecords && analysisRecords.length > 0) {
            const pendingCount = analysisRecords.filter(r => r.analysis_status === 'pending').length;
            if (pendingCount > 0) {
              console.log(`TRIGGER-DEBUG: Scan ${scan.scan_id} has ${pendingCount} pending analysis records - forcing back to ready_for_analysis`);
              
              await supabase
                .from('scan_history')
                .update({ 
                  status: 'ready_for_analysis',
                  updated_at: new Date().toISOString()
                })
                .eq('scan_id', scan.scan_id);
              
              // Restart the trigger process to pick up this scan
              console.log('TRIGGER-DEBUG: Restarting trigger process to pick up rescued scan');
              return res.status(200).json({ 
                success: true, 
                message: `Rescued scan ${scan.scan_id} for analysis - trigger will rerun`,
                rescued_scan: scan.scan_id
              });
            }
          }
        }
      }
      
      console.log('TRIGGER-DEBUG: No ready scans - may have been already processed or completed prematurely');
      
      return res.status(200).json({ 
        success: true, 
        message: 'No scans ready for analysis found',
        scans_processed: 0
      });
    }

    console.log(`TRIGGER-DEBUG: Found ${readyScans.length} scans ready for analysis`);

    // Check for scans that are currently being analyzed to prevent duplicate processing
    const { data: analyzingScans, error: analyzingError } = await supabase
      .from('scan_history')
      .select('scan_id')
      .eq('status', 'analyzing')
      .limit(10);

    if (analyzingError) {
      console.error('TRIGGER-DEBUG: Error checking analyzing scans:', analyzingError);
    } else {
      console.log(`TRIGGER-DEBUG: Found ${analyzingScans?.length || 0} scans currently being analyzed`);
    }

    const analyzingScanIds = new Set(analyzingScans?.map(s => s.scan_id) || []);
    
    // Filter out scans that are already being analyzed
    const scansToProcess = readyScans.filter(scan => !analyzingScanIds.has(scan.scan_id));
    
    if (scansToProcess.length === 0) {
      console.log('TRIGGER-DEBUG: All ready scans are already being analyzed');
      return res.status(200).json({ 
        success: true, 
        message: 'All ready scans are already being analyzed',
        scans_processed: 0
      });
    }

    console.log(`TRIGGER-DEBUG: Processing ${scansToProcess.length} scans`);

    // Mark scans as analyzing to prevent duplicate processing
    for (const scan of scansToProcess) {
      await supabase
        .from('scan_history')
        .update({ 
          status: 'analyzing',
          updated_at: new Date().toISOString()
        })
        .eq('scan_id', scan.scan_id);
    }
    
    console.log('TRIGGER-DEBUG: Edge Function URL: https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan');
    
    // Add retry logic for Edge Function call
    let edgeFunctionSuccess = false;
    let retryCount = 0;
    const maxRetries = 3;
    let lastError = null;
    
    while (!edgeFunctionSuccess && retryCount < maxRetries) {
      try {
        console.log(`TRIGGER-DEBUG: Edge Function attempt ${retryCount + 1}/${maxRetries}`);
        
        const response = await fetch(
          "https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan",
          { 
            method: "POST",
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({
              scan_ids: scansToProcess.map(s => s.scan_id),
              user_ids: scansToProcess.map(s => s.user_id)
            })
          }
        );
        
        console.log(`TRIGGER-DEBUG: Edge Function response status (attempt ${retryCount + 1}):`, response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`TRIGGER-DEBUG: Edge Function error (attempt ${retryCount + 1}):`, response.status, errorText);
          lastError = new Error(`Edge Function error: ${response.status} ${errorText}`);
          retryCount++;
          
          if (retryCount < maxRetries) {
            console.log(`TRIGGER-DEBUG: Retrying Edge Function in 10 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
          continue;
        }
        
        const data = await response.json();
        console.log(`TRIGGER-DEBUG: Edge Function response (attempt ${retryCount + 1}):`, data);
        
        if (data.success) {
          console.log(`TRIGGER-DEBUG: ✅ Edge Function succeeded on attempt ${retryCount + 1}`);
          edgeFunctionSuccess = true;
          
          res.status(200).json({ 
            success: true, 
            message: 'Gemini analysis triggered successfully',
            scans_processed: scansToProcess.length,
            scan_ids: scansToProcess.map(s => s.scan_id),
            data,
            attempts: retryCount + 1
          });
          return;
        } else {
          console.log(`TRIGGER-DEBUG: Edge Function returned success: false`);
          lastError = new Error(`Edge Function returned success: false: ${data.message || 'Unknown error'}`);
          retryCount++;
          
          if (retryCount < maxRetries) {
            console.log(`TRIGGER-DEBUG: Retrying Edge Function in 10 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
        
      } catch (error) {
        console.error(`TRIGGER-DEBUG: Edge Function exception (attempt ${retryCount + 1}):`, error);
        lastError = error;
        retryCount++;
        
        if (retryCount < maxRetries) {
          console.log(`TRIGGER-DEBUG: Retrying Edge Function in 10 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
    }
    
    // If all retries failed, reset scan status and return error
    console.error('TRIGGER-DEBUG: All Edge Function attempts failed');
    
    // Mark scans as error to avoid infinite retry loops and provide visibility into the failure
    for (const scan of scansToProcess) {
      await supabase
        .from('scan_history')
        .update({ 
          status: 'error',
          error_message: lastError?.message || 'Edge Function failed after all retries',
          updated_at: new Date().toISOString()
        })
        .eq('scan_id', scan.scan_id);
    }
    
    return res.status(500).json({ 
      error: 'Edge Function failed after all retries', 
      details: lastError?.message || 'Unknown error',
      attempts: retryCount
    });
  } catch (error) {
    console.error('TRIGGER-DEBUG: Error triggering Gemini analysis:', error);
    console.error('TRIGGER-DEBUG: Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to trigger Gemini analysis',
      details: error.message 
    });
  }
} 