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

    // Check for scans that are ready for analysis
    console.log('TRIGGER-DEBUG: Checking for scans ready for analysis...');
    const { data: readyScans, error: scanError } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, created_at, emails_processed, subscriptions_found')
      .eq('status', 'ready_for_analysis')
      .order('created_at', { ascending: true })
      .limit(5); // Process up to 5 scans at a time

    if (scanError) {
      console.error('TRIGGER-DEBUG: Error fetching ready scans:', scanError);
      return res.status(500).json({ error: 'Failed to fetch ready scans', details: scanError.message });
    }

    if (!readyScans || readyScans.length === 0) {
      console.log('TRIGGER-DEBUG: No scans ready for analysis');
      return res.status(200).json({ 
        success: true, 
        message: 'No scans ready for analysis',
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
    
    console.log('TRIGGER-DEBUG: Edge Function response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('TRIGGER-DEBUG: Edge Function error:', response.status, errorText);
      
      // Reset scan status back to ready_for_analysis if Edge Function fails
      for (const scan of scansToProcess) {
        await supabase
          .from('scan_history')
          .update({ 
            status: 'ready_for_analysis',
            updated_at: new Date().toISOString()
          })
          .eq('scan_id', scan.scan_id);
      }
      
      return res.status(response.status).json({ 
        error: 'Edge Function error', 
        details: errorText 
      });
    }
    
    const data = await response.json();
    console.log('TRIGGER-DEBUG: Edge Function response:', data);
    
    res.status(200).json({ 
      success: true, 
      message: 'Gemini analysis triggered successfully',
      scans_processed: scansToProcess.length,
      scan_ids: scansToProcess.map(s => s.scan_id),
      data 
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