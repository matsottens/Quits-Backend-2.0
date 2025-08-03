// Debug endpoint to test pattern matching
import { analyzeEmailForSubscriptions } from './email-utils.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subject, from, body } = req.body;

    if (!subject && !from && !body) {
      return res.status(400).json({ 
        error: 'Please provide at least one of: subject, from, or body' 
      });
    }

    console.log('PATTERN-DEBUG: Testing pattern matching...');
    console.log('PATTERN-DEBUG: Subject:', subject);
    console.log('PATTERN-DEBUG: From:', from);
    console.log('PATTERN-DEBUG: Body length:', body?.length || 0);

    const emailData = {
      subject: subject || '',
      from: from || '',
      body: body || ''
    };

    const analysis = analyzeEmailForSubscriptions(emailData);

    return res.status(200).json({
      success: true,
      analysis,
      input: {
        subject,
        from,
        bodyLength: body?.length || 0
      }
    });

  } catch (error) {
    console.error('PATTERN-DEBUG: Error:', error);
    return res.status(500).json({
      error: 'Pattern matching test failed',
      details: error.message
    });
  }
} 