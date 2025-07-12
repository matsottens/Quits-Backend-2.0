// Catch-all handler for all API paths
import jsonwebtoken from 'jsonwebtoken';
const { verify } = jsonwebtoken;

// Helper function to verify JWT token
const verifyToken = (token, req) => {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    return verify(token, jwtSecret);
  } catch (error) {
    console.error(`Token verification error for ${req.url}:`, error);
    return null;
  }
};

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log(`Handling OPTIONS preflight request for ${req.url}`);
    return res.status(204).end();
  }

  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  // Extract the path from the request
  const fullPath = req.url || '';
  const pathParts = fullPath.split('?')[0].split('/').filter(Boolean);
  console.log(`Combined handler processing path: ${req.url}`);

  try {
    // Handle different API endpoints
    if (fullPath.includes('/auth/me')) {
      // Auth/me endpoint
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed for auth/me' });
      }

      // Extract and verify token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      const decoded = verifyToken(token, req);

      if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      return res.status(200).json({
        id: decoded.id,
        email: decoded.email,
        name: decoded.name || null,
        picture: decoded.picture || null
      });
    } 
    else if (fullPath.includes('/subscription')) {
      // Subscription endpoint
      if (req.method === 'GET') {
        // Extract and verify token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token, req);

        if (!decoded) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Return mock subscription data
        return res.status(200).json({
          success: true,
          subscriptions: [
            {
              id: 'sub_123',
              name: 'Netflix',
              price: 15.99,
              billingCycle: 'monthly',
              nextBillingDate: '2023-05-15',
              category: 'entertainment'
            },
            {
              id: 'sub_124',
              name: 'Spotify',
              price: 9.99,
              billingCycle: 'monthly',
              nextBillingDate: '2023-05-10',
              category: 'music'
            },
            {
              id: 'sub_125',
              name: 'Amazon Prime',
              price: 119,
              billingCycle: 'yearly',
              nextBillingDate: '2023-12-01',
              category: 'shopping'
            }
          ],
          meta: {
            total: 3,
            totalMonthly: 25.98,
            totalYearly: 119,
            totalAnnualized: 431.76
          }
        });
      } else {
        return res.status(405).json({ error: 'Method not supported for this endpoint' });
      }
    } 
    else if (fullPath.includes('/email-scan')) {
      // Email scan endpoint
      if (req.method === 'POST') {
        // Extract and verify token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token, req);

        if (!decoded) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Return mock scan response
        const mockScanId = 'scan_' + Math.random().toString(36).substring(2, 15);
        return res.status(202).json({
          success: true,
          message: 'Email scan initiated successfully',
          scanId: mockScanId,
          estimatedTime: '30 seconds',
          user: {
            email: decoded.email
          }
        });
      } else {
        return res.status(405).json({ error: 'Method not supported for this endpoint' });
      }
    } 
    else if (fullPath.includes('/scan-status')) {
      // Scan status endpoint
      if (req.method === 'GET') {
        // Extract and verify token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token, req);

        if (!decoded) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Get scanId from path or query string
        const pathParts = fullPath.split('/');
        const scanIdFromPath = pathParts[pathParts.length - 1];
        const queryParams = new URLSearchParams(fullPath.split('?')[1] || '');
        const scanId = scanIdFromPath !== 'scan-status' ? scanIdFromPath : (queryParams.get('scanId') || 'latest');

        try {
          // Create Supabase client
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

          // Query the scan_history table for the user's latest scan
          const { data: scan, error } = await supabase
            .from('scan_history')
            .select('*')
            .eq('user_id', decoded.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (error) {
            console.error('Error fetching scan:', error);
            return res.status(500).json({ error: error.message });
          }
          
          if (!scan) {
            return res.status(404).json({ error: 'No scan found' });
          }

          // Calculate progress based on status
          let progress = 0;
          if (scan.status === 'in_progress') {
            progress = Math.min(50, scan.progress || 0); // Reading phase: 0-50%
          } else if (scan.status === 'ready_for_analysis' || scan.status === 'analyzing') {
            progress = 50 + (scan.progress || 0) / 2; // Analysis phase: 50-100%
          } else if (scan.status === 'completed') {
            progress = 100;
          }

          // Get stats for the scan
          const stats = {
            emails_found: scan.emails_found || 0,
            emails_to_process: scan.emails_to_process || 0,
            emails_processed: scan.emails_processed || 0,
            subscriptions_found: scan.subscriptions_found || 0,
            potential_subscriptions: scan.potential_subscriptions || 0
          };

          return res.status(200).json({ 
            status: scan.status, 
            scan_id: scan.scan_id, 
            created_at: scan.created_at,
            progress: progress,
            stats: stats
          });

        } catch (dbError) {
          console.error('Database error in scan-status:', dbError);
          return res.status(500).json({ error: 'Database error' });
        }
      } else {
        return res.status(405).json({ error: 'Method not supported for this endpoint' });
      }
    } 
    else {
      // Default handler for other paths
      return res.status(200).json({
        message: 'Catch-all API handler',
        path: req.url,
        method: req.method,
        supported: true,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error(`Error handling API request to ${req.url}:`, error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An error occurred processing your request',
      path: req.url
    });
  }
} 