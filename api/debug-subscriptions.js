// Debug endpoint to test subscription detection with sample data
import { analyzeEmailForSubscriptions } from './email-utils.js';

// Sample emails with common subscription services that need detection
const sampleEmails = {
  babbel: {
    payload: {
      headers: [
        { name: 'Subject', value: 'Your Babbel subscription renewal' },
        { name: 'From', value: 'Babbel <no-reply@babbel.com>' },
        { name: 'Date', value: 'Wed, 15 Mar 2023 09:13:42 +0000' }
      ],
      body: {
        data: Buffer.from(`
Dear Customer,

Thank you for being a valued Babbel customer. This email is to inform you that your Babbel subscription
will be renewed on April 15, 2023.

Subscription details:
- Plan: Babbel Complete
- Amount: $6.95 USD
- Billing Cycle: Monthly
- Next billing date: April 15, 2023

You can manage your subscription anytime by logging into your account at babbel.com.

Happy language learning!
The Babbel Team
        `).toString('base64')
      }
    }
  },
  vercel: {
    payload: {
      headers: [
        { name: 'Subject', value: 'Vercel Invoice for April 2023' },
        { name: 'From', value: 'Vercel <billing@vercel.com>' },
        { name: 'Date', value: 'Sat, 1 Apr 2023 00:01:23 +0000' }
      ],
      body: {
        data: Buffer.from(`
Vercel, Inc.
340 S Lemon Ave #4133
Walnut, CA 91789
United States

Invoice #VER-2023-04-1001
Date: April 1, 2023
Due Date: April 1, 2023

Bill To:
Your Name
your.email@example.com

Description | Amount
--------------------------
Vercel Pro Plan | $20.00
Monthly subscription (April 1-30, 2023)

Payment processed automatically using card ending in **1234
Total: $20.00 USD

Your next billing date is May 1, 2023.
Thank you for using Vercel!
        `).toString('base64')
      }
    }
  },
  nba: {
    payload: {
      headers: [
        { name: 'Subject', value: 'Your NBA League Pass subscription has been renewed' },
        { name: 'From', value: 'NBA <noreply@nba.com>' },
        { name: 'Date', value: 'Sun, 15 Oct 2023 14:30:00 +0000' }
      ],
      body: {
        data: Buffer.from(`
NBA LEAGUE PASS
SUBSCRIPTION CONFIRMATION

Dear Basketball Fan,

Your NBA League Pass subscription has been successfully renewed for the 2023-24 season.

Subscription Details:
- Package: NBA League Pass Premium
- Price: $14.99/month
- Next billing date: November 15, 2023

You now have access to:
- Live games and full game replays
- Commercial-free viewing experience
- Multi-game viewing
- HD video quality
- NBA TV live 24/7

To manage your subscription, please visit watch.nba.com/manage.

Enjoy the new NBA season!
NBA Digital
        `).toString('base64')
      }
    }
  }
};

export const config = {
  path: '/api/debug-subscriptions'
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    console.log('Testing subscription detection with sample emails');
    
    // Analyze each sample email
    const results = {
      babbel: analyzeEmailForSubscriptions(sampleEmails.babbel),
      vercel: analyzeEmailForSubscriptions(sampleEmails.vercel),
      nba: analyzeEmailForSubscriptions(sampleEmails.nba)
    };
    
    // Log the results for each service
    console.log('Babbel analysis:', 
      results.babbel.isSubscription ? 'Detected as subscription' : 'Not detected',
      `Confidence: ${results.babbel.confidence.toFixed(2)}`,
      `Service: ${results.babbel.serviceName || 'unknown'}`
    );
    
    console.log('Vercel analysis:', 
      results.vercel.isSubscription ? 'Detected as subscription' : 'Not detected',
      `Confidence: ${results.vercel.confidence.toFixed(2)}`,
      `Service: ${results.vercel.serviceName || 'unknown'}`
    );
    
    console.log('NBA analysis:', 
      results.nba.isSubscription ? 'Detected as subscription' : 'Not detected',
      `Confidence: ${results.nba.confidence.toFixed(2)}`,
      `Service: ${results.nba.serviceName || 'unknown'}`
    );
    
    // Return the analysis results
    res.status(200).json({
      results,
      message: 'Subscription detection test completed'
    });
    
  } catch (error) {
    console.error('Error testing subscription detection:', error);
    res.status(500).json({ error: 'Failed to test subscription detection', message: error.message });
  }
} 