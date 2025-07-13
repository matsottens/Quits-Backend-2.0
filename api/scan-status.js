import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// Token verification function
const verifyToken = (token, req) => {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    return jwt.verify(token, jwtSecret);
  } catch (error) {
    console.error('Token verification error:', error.message);
    return null;
  }
};

export default async function handler(req, res) {
  console.log('SCAN-STATUS-DEBUG: Handler called');
  console.log('SCAN-STATUS-DEBUG: Method:', req.method);
  console.log('SCAN-STATUS-DEBUG: URL:', req.url);
  console.log('SCAN-STATUS-DEBUG: Headers:', {
    'authorization': req.headers.authorization ? 'Present' : 'Missing',
    'content-type': req.headers['content-type']
  });

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;
  
  const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);
  
  // Debug Supabase connection
  console.log('SCAN-STATUS-DEBUG: SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
  console.log('SCAN-STATUS-DEBUG: SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');
  console.log('SCAN-STATUS-DEBUG: SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Not set');
  console.log('SCAN-STATUS-DEBUG: Final supabaseKey:', supabaseKey ? 'Set' : 'Not set');
  
  try {
    // Extract and verify token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('SCAN-STATUS-DEBUG: Missing or invalid authorization header');
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    console.log('SCAN-STATUS-DEBUG: Token length:', token.length);
    
    const decoded = verifyToken(token, req);
    if (!decoded) {
      console.log('SCAN-STATUS-DEBUG: Token verification failed');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    console.log('SCAN-STATUS-DEBUG: Token verified successfully');
    console.log('SCAN-STATUS-DEBUG: Decoded token keys:', Object.keys(decoded));
    
    const googleId = decoded.id || decoded.sub;
    console.log('SCAN-STATUS-DEBUG: Google ID from token:', googleId);

    if (!googleId) {
      console.log('SCAN-STATUS-DEBUG: No Google ID found in token');
      return res.status(401).json({ error: 'Invalid user ID in token' });
    }

    // Get scanId from path or query parameters early
    const pathParts = req.url.split('/');
    const scanIdFromPath = pathParts[pathParts.length - 1];
    const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
    const scanId = scanIdFromPath !== 'scan-status' ? scanIdFromPath : (queryParams.get('scanId') || 'latest');

    console.log('SCAN-STATUS-DEBUG: URL:', req.url);
    console.log('SCAN-STATUS-DEBUG: Path parts:', pathParts);
    console.log('SCAN-STATUS-DEBUG: Scan ID from path:', scanIdFromPath);
    console.log('SCAN-STATUS-DEBUG: Final scan ID:', scanId);

    // Look up the user in the database to get the UUID
    console.log('SCAN-STATUS-DEBUG: Looking up user with Google ID:', googleId);
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('google_id', googleId)
      .single();

    if (userError || !user) {
      console.error('SCAN-STATUS-DEBUG: User lookup error:', userError);
      console.error('SCAN-STATUS-DEBUG: User data:', user);
      
      // If user doesn't exist yet, this might be a new user whose scan is still being processed
      // Return a status indicating the scan is still being set up
      if (userError && userError.code === 'PGRST116') {
        console.log('SCAN-STATUS-DEBUG: User not found, scan may still be being set up');
        return res.status(200).json({
          status: 'pending',
          scan_id: scanId,
          progress: 0,
          stats: {
            emails_found: 0,
            emails_to_process: 0,
            emails_processed: 0,
            subscriptions_found: 0
          },
          message: 'Scan is being set up, please wait...'
        });
      }
      
      return res.status(401).json({ error: 'User not found in database' });
    }

    const userId = user.id; // This is the UUID
    console.log('SCAN-STATUS-DEBUG: Google ID:', googleId);
    console.log('SCAN-STATUS-DEBUG: Database User ID (UUID):', userId);

    let scan;
    let error;

    if (scanId && scanId !== 'latest') {
      // Query by specific scan ID
      console.log('SCAN-STATUS-DEBUG: Querying by specific scan ID:', scanId);
      const { data, error: scanError } = await supabase
        .from('scan_history')
        .select('*')
        .eq('scan_id', scanId)
        .eq('user_id', userId)
        .single();
      
      scan = data;
      error = scanError;
      console.log('SCAN-STATUS-DEBUG: Specific scan query result:', { scan, error });
    } else {
      // Query latest scan for user
      console.log('SCAN-STATUS-DEBUG: Querying latest scan for user');
      const { data, error: scanError } = await supabase
        .from('scan_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      scan = data;
      error = scanError;
      console.log('SCAN-STATUS-DEBUG: Latest scan query result:', { scan, error });
    }

    if (error) {
      console.error('Error fetching scan:', error);
      
      // If no scan found, let's see what scans exist for this user
      if (error.code === 'PGRST116') {
        console.log('SCAN-STATUS-DEBUG: No scan found with ID:', scanId);
        console.log('SCAN-STATUS-DEBUG: Looking for scans for user ID:', userId);
        
        const { data: allScans, error: allScansError } = await supabase
          .from('scan_history')
          .select('scan_id, status, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (allScansError) {
          console.error('SCAN-STATUS-DEBUG: Error fetching all scans:', allScansError);
          return res.status(500).json({ error: allScansError.message });
        }
        
        console.log('SCAN-STATUS-DEBUG: Found scans for user:', allScans);
        
        // If we found scans, return the latest one instead of error
        if (allScans && allScans.length > 0) {
          const latestScan = allScans[0];
          console.log('SCAN-STATUS-DEBUG: Returning latest scan instead:', latestScan.scan_id, ',', req.url);
          
          // Get the full scan data for the latest scan
          const { data: fullScan, error: fullScanError } = await supabase
            .from('scan_history')
            .select('*')
            .eq('scan_id', latestScan.scan_id)
            .single();
          
          if (fullScanError) {
            console.error('SCAN-STATUS-DEBUG: Error fetching full scan data:', fullScanError);
            return res.status(500).json({ error: fullScanError.message });
          }
          
          // Use the latest scan data
          scan = fullScan;
          error = null;
          
          // Add a warning in the response that we're returning a different scan
          const responseData = {
            status: scan.status, 
            scan_id: scan.scan_id, 
            created_at: scan.created_at,
            progress: calculateProgress(scan),
            stats: {
              emails_found: scan.emails_found || 0,
              emails_to_process: scan.emails_to_process || 0,
              emails_processed: scan.emails_processed || 0,
              subscriptions_found: scan.subscriptions_found || 0
            },
            warning: `Requested scan ID '${scanId}' not found. Returning latest scan '${scan.scan_id}' instead.`
          };
          
          return res.status(200).json(responseData);
        } else {
          // No scans found at all
          return res.status(404).json({ 
            error: 'No scans found for user',
            requested_scan_id: scanId,
            user_id: userId
          });
        }
      } else {
        // Some other error occurred
        return res.status(500).json({ error: error.message });
      }
    }
    
    if (!scan) {
      return res.status(404).json({ error: 'No scan found' });
    }

    // Calculate progress based on status
    let progress = calculateProgress(scan);

    // Get stats for the scan
    const stats = {
      emails_found: scan.emails_found || 0,
      emails_to_process: scan.emails_to_process || 0,
      emails_processed: scan.emails_processed || 0,
      subscriptions_found: scan.subscriptions_found || 0
    };

    // Get additional information for failed or pending scans
    let additionalInfo = {};
    
    if (scan.status === 'failed' || scan.status === 'pending' || scan.status === 'ready_for_analysis') {
      // Get subscription analysis data to show what was found
      const { data: analysisData, error: analysisError } = await supabase
        .from('subscription_analysis')
        .select('id, subscription_name, analysis_status, confidence_score, created_at')
        .eq('scan_id', scan.scan_id)
        .order('created_at', { ascending: false });

      if (!analysisError && analysisData) {
        additionalInfo.analysis_results = analysisData;
        additionalInfo.pending_count = analysisData.filter(a => a.analysis_status === 'pending').length;
        additionalInfo.completed_count = analysisData.filter(a => a.analysis_status === 'completed').length;
        additionalInfo.failed_count = analysisData.filter(a => a.analysis_status === 'failed').length;
      }

      // For failed scans, include error message
      if (scan.status === 'failed' && scan.error_message) {
        additionalInfo.error_message = scan.error_message;
      }

      // For ready_for_analysis scans, check if they've been stuck too long
      if (scan.status === 'ready_for_analysis') {
        const scanAge = Date.now() - new Date(scan.created_at).getTime();
        const maxWaitTime = 5 * 60 * 1000; // 5 minutes
        
        if (scanAge > maxWaitTime) {
          additionalInfo.stuck_warning = true;
          additionalInfo.scan_age_minutes = Math.floor(scanAge / (60 * 1000));
        }
      }
    }

    res.status(200).json({ 
      status: scan.status, 
      scan_id: scan.scan_id, 
      created_at: scan.created_at,
      progress: progress,
      stats: stats,
      ...additionalInfo
    });
  } catch (error) {
    console.error('Unexpected error in scan-status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 

// Helper function to calculate progress
const calculateProgress = (scan) => {
  let progress = 0;
  
  // Handle different scan statuses with more granular progress
  switch (scan.status) {
    case 'pending':
      progress = 0;
      break;
    case 'in_progress':
      // Use the actual progress value from the database
      progress = Math.min(80, scan.progress || 0);
      break;
    case 'ready_for_analysis':
      progress = 85;
      break;
    case 'analyzing':
      // If pattern matching already found subscriptions, show 100% since it's functionally complete
      if (scan.subscriptions_found > 0) {
        progress = 100;
      } else {
        progress = 90;
      }
      break;
    case 'quota_exhausted':
      // Keep progress at current level but indicate temporary pause
      progress = Math.min(95, scan.progress || 90);
      break;
    case 'completed':
      progress = 100;
      break;
    case 'failed':
      // Keep the progress where it failed, but cap at 95%
      progress = Math.min(95, scan.progress || 0);
      break;
    default:
      progress = scan.progress || 0;
  }
  
  return progress;
}; 