import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Ensure no caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  try {
    // Extract and verify token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return res.status(401).json({ 
        success: false, 
        message: 'Missing or invalid authorization token' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the token
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
      console.log('Token verified successfully');
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Extract user ID from token
    const userId = decodedToken.sub;
    if (!userId) {
      console.error('User ID not found in token');
      return res.status(400).json({ 
        success: false, 
        message: 'User ID not found in token' 
      });
    }

    console.log(`Exporting subscriptions for user: ${userId}`);

    // Determine export format from query param (default to JSON)
    const format = req.query.format?.toLowerCase() || 'json';
    if (format !== 'json' && format !== 'csv') {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Supported formats: json, csv'
      });
    }

    // Fetch user's subscriptions from Supabase
    const subscriptionsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&order=name.asc`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );

    if (!subscriptionsResponse.ok) {
      const errorText = await subscriptionsResponse.text();
      console.error(`Failed to fetch subscriptions: ${errorText}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch subscriptions'
      });
    }

    const subscriptions = await subscriptionsResponse.json();
    console.log(`Found ${subscriptions.length} subscriptions for user ${userId}`);

    if (subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No subscriptions found'
      });
    }

    // Format the response based on requested format
    if (format === 'json') {
      // Just return the subscriptions as JSON
      return res.status(200).json({
        success: true,
        count: subscriptions.length,
        subscriptions: subscriptions
      });
    } else if (format === 'csv') {
      // Convert to CSV
      const csvHeader = [
        'Name',
        'Service',
        'Price',
        'Currency',
        'Billing Cycle',
        'Next Billing Date',
        'Cancel URL',
        'Notes'
      ].join(',');

      const csvRows = subscriptions.map(sub => [
        `"${(sub.name || '').replace(/"/g, '""')}"`,
        `"${(sub.service || '').replace(/"/g, '""')}"`,
        sub.price || '',
        sub.currency || '',
        `"${(sub.billing_cycle || '').replace(/"/g, '""')}"`,
        sub.next_billing_date || '',
        `"${(sub.cancel_url || '').replace(/"/g, '""')}"`,
        `"${(sub.notes || '').replace(/"/g, '""')}"`
      ].join(','));

      const csvContent = [csvHeader, ...csvRows].join('\n');

      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="subscriptions-${userId}.csv"`);
      
      return res.status(200).send(csvContent);
    }
  } catch (error) {
    console.error('Error in export endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
} 