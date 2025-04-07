import express from 'express';
import { google } from 'googleapis';
import { oauth2Client } from '../config/google.js';
import { summarizeEmail } from '../services/gemini.js';
import { extractSubscriptionDetails } from '../services/subscription.js';
import { authenticateUser } from '../middlewares/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Middleware to authenticate user
router.use(authenticateUser);

// Start email scanning
router.post('/scan', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user tokens from Supabase
    const { data: userToken, error: tokenError } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();
      
    if (tokenError || !userToken) {
      return res.status(401).json({ error: 'User not authenticated with Google' });
    }
    
    // Set OAuth credentials
    oauth2Client.setCredentials({
      access_token: userToken.access_token,
      refresh_token: userToken.refresh_token,
    });
    
    // Initialize Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Search for subscription confirmation emails
    const searchResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'subject:(confirmation OR receipt OR subscription OR welcome OR invoice OR payment) is:unread',
      maxResults: 50,
    });
    
    if (!searchResponse.data.messages || searchResponse.data.messages.length === 0) {
      return res.status(200).json({ 
        message: 'No subscription emails found',
        subscriptions: [] 
      });
    }
    
    // Process each email
    const foundSubscriptions = [];
    
    for (const message of searchResponse.data.messages) {
      // Get full message details
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full',
      });
      
      // Extract email content
      const emailContent = extractEmailContent(email.data);
      
      // Skip emails with no content
      if (!emailContent) continue;
      
      // Summarize email with Gemini
      const summary = await summarizeEmail(emailContent);
      
      // Extract subscription details from summary
      const subscriptionDetails = extractSubscriptionDetails(summary);
      
      if (subscriptionDetails) {
        // Save subscription to database
        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            name: subscriptionDetails.name,
            price: subscriptionDetails.price,
            currency: subscriptionDetails.currency,
            billing_cycle: subscriptionDetails.billingCycle,
            next_billing_date: subscriptionDetails.nextBillingDate,
            email_id: message.id,
            provider: subscriptionDetails.provider,
            category: subscriptionDetails.category,
          })
          .select();
          
        if (!subscriptionError && subscription) {
          foundSubscriptions.push(subscription[0]);
        }
      }
    }
    
    res.status(200).json({ 
      message: `Found ${foundSubscriptions.length} subscriptions`,
      subscriptions: foundSubscriptions 
    });
    
  } catch (error) {
    console.error('Email scan error:', error);
    res.status(500).json({ error: 'Failed to scan emails' });
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

export default router; 