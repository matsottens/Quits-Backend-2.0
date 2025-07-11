// API endpoint to trigger Gemini analysis independently
import jsonwebtoken from 'jsonwebtoken';
import { analyzeEmailsForUser } from './gemini-analysis-utils.js';

const { verify } = jsonwebtoken;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    const decoded = verify(token, jwtSecret);
    const userId = decoded.id || decoded.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Invalid user ID in token' });
    }

    // Get scan_id from request body
    const { scan_id } = req.body;
    if (!scan_id) {
      return res.status(400).json({ error: 'scan_id is required' });
    }

    console.log(`Triggering analysis for user ${userId}, scan ${scan_id}`);

    // Start analysis in background
    analyzeEmailsForUser(userId, scan_id)
      .then(result => {
        console.log('Analysis completed successfully:', result);
      })
      .catch(error => {
        console.error('Analysis failed:', error);
      });

    // Return immediately without waiting for analysis to complete
    return res.status(202).json({
      success: true,
      message: 'Analysis triggered successfully',
      scan_id: scan_id,
      status: 'processing'
    });

  } catch (error) {
    console.error('Error triggering analysis:', error);
    return res.status(500).json({
      error: 'Failed to trigger analysis',
      message: error.message
    });
  }
} 