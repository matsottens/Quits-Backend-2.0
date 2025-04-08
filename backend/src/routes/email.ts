import express, { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { oauth2Client } from '../config/google.js';
import { summarizeEmail } from '../services/gemini.js';
import { extractSubscriptionDetails } from '../services/subscription.js';
import { authenticateUser, AuthRequest } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Apply authentication middleware to all routes except test-gemini
router.use((req, res, next) => {
  if (req.path === '/test-gemini') {
    return next();
  }
  return authenticateUser(req, res, next);
});

// Start email scanning
router.post('/scan', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { rawEmail } = req.body;
    
    if (!rawEmail) {
      return res.status(400).json({ error: 'No email content provided' });
    }

    const result = await summarizeEmail(rawEmail);
    res.json(result);
  } catch (error) {
    console.error('Error scanning email:', error);
    res.status(500).json({ error: 'Failed to scan email' });
  }
});

// Helper function to extract email content
function extractEmailContent(message) {
  if (!message.payload) return null;
  
  // Extract content from payload parts
  let content = '';
  
  // Function to recursively extract text from parts
  function extractFromParts(parts) {
    if (!parts) return;
    
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        content += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  }
  
  if (message.payload.parts) {
    extractFromParts(message.payload.parts);
  } else if (message.payload.body && message.payload.body.data) {
    content = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  }
  
  return content;
}

/**
 * Test endpoint to verify Gemini service is working
 */
router.post('/test-gemini', async (req: Request, res: Response) => {
  try {
    const { emailContent } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: 'Email content is required' });
    }
    
    console.log('Testing Gemini service with sample email content');
    const result = await summarizeEmail(emailContent);
    
    return res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error testing Gemini service:', error);
    return res.status(500).json({ 
      error: 'Failed to test Gemini service',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Process an email and extract subscription details
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    const { emailContent } = req.body;
    
    if (!emailContent) {
      return res.status(400).json({ error: 'Email content is required' });
    }
    
    const result = await summarizeEmail(emailContent);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error processing email:', error);
    return res.status(500).json({ 
      error: 'Failed to process email',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router; 