// Test endpoint for direct Gemini analysis
import { analyzeEmailsForUser } from './gemini-analysis-utils.js';

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
    // Get test parameters
    const { userId, scanId } = req.body;
    
    if (!userId || !scanId) {
      return res.status(400).json({ error: 'userId and scanId are required' });
    }

    console.log(`Testing direct Gemini analysis for user ${userId}, scan ${scanId}`);

    // Call the analysis function directly
    const result = await analyzeEmailsForUser(userId, scanId);

    return res.status(200).json({
      success: true,
      message: 'Direct Gemini analysis test completed',
      result
    });

  } catch (error) {
    console.error('Test Gemini analysis error:', error);
    return res.status(500).json({
      error: 'Test failed',
      message: error.message
    });
  }
} 