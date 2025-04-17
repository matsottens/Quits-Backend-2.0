import { setCorsHeaders } from '../cors-middleware.js';

// Email scanning endpoint handler
export default async function handler(req, res) {
  // Handle CORS with extra headers for Gmail token
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return;

  // Log request info for debugging
  console.log('Email scan request received');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify({
    'content-type': req.headers['content-type'],
    'authorization': req.headers['authorization'] ? 'Present (masked)' : 'Not present',
    'x-gmail-token': req.headers['x-gmail-token'] ? 'Present (masked)' : 'Not present',
  }));

  // Handle different HTTP methods
  if (req.method === 'POST') {
    try {
      // Check for required headers
      if (!req.headers.authorization) {
        return res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'No authorization token provided'
        });
      }

      if (!req.headers['x-gmail-token']) {
        return res.status(400).json({ 
          error: 'Bad Request', 
          message: 'Gmail token is required for scanning'
        });
      }

      // For now, return a mock success response
      // In a real implementation, this would process the email scan
      return res.status(200).json({
        success: true,
        message: 'Email scan initiated',
        scanId: 'scan_' + Date.now(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in email scan handler:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  } else {
    // Only allow POST method
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'Only POST requests are supported for this endpoint'
    });
  }
} 