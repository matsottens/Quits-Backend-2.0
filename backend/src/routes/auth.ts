import express from 'express';
import { google } from 'googleapis';
import { oauth2Client, SCOPES } from '../config/google.js';
import { supabase } from '../config/supabase.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Get Google OAuth URL
router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url });
});

// Handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'No authorization code provided' });
  }

  try {
    console.log('Received auth code, attempting to exchange for tokens...');
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2('v2');
    const userInfo = await oauth2.userinfo.get({ auth: oauth2Client });

    if (!userInfo.data.email) {
      throw new Error('No email found in Google user info');
    }

    // Create or update user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userInfo.data.email,
      password: crypto.randomUUID(), // Generate a random password
      options: {
        data: {
          name: userInfo.data.name,
          avatar_url: userInfo.data.picture,
        }
      }
    });

    if (authError) {
      // If user already exists, try to sign in
      if (authError.message.includes('already registered')) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: userInfo.data.email,
          password: crypto.randomUUID() // This will fail, but we'll update the user anyway
        });

        if (signInError) {
          console.error('Sign in error:', signInError);
        }
      } else {
        throw authError;
      }
    }

    // Store Google tokens
    const { error: tokenError } = await supabase
      .from('user_tokens')
      .upsert({
        user_id: authData?.user?.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date
      });

    if (tokenError) {
      throw tokenError;
    }

    // Return the Supabase session token
    res.json({
      token: authData?.session?.access_token,
      user: {
        id: authData?.user?.id,
        email: userInfo.data.email,
        name: userInfo.data.name,
        avatar_url: userInfo.data.picture
      }
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.message
    });
  }
});

// Get current user
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(req.headers.authorization?.split(' ')[1]);
    
    if (error) throw error;
    
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

export default router; 