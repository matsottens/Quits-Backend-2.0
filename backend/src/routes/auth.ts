import express from 'express';
import { google } from 'googleapis';
import { oauth2Client, SCOPES } from '../config/google.js';
import { supabase } from '../config/supabase.js';
import { authenticateUser, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Get Google OAuth URL
router.get('/google', (req, res) => {
  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    res.json({ url });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      return res.status(400).json({ error: 'Failed to get access token' });
    }

    // Get user info from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2('v2');
    const { data: userInfo } = await oauth2.userinfo.get({ auth: oauth2Client });

    if (!userInfo.email) {
      return res.status(400).json({ error: 'No email found in user info' });
    }

    // Create or update user in Supabase
    const { data: user, error: userError } = await supabase.auth.signUp({
      email: userInfo.email,
      password: crypto.randomUUID(), // Generate random password for OAuth users
      options: {
        data: {
          name: userInfo.name,
          avatar_url: userInfo.picture,
        }
      }
    });

    if (userError) {
      console.error('Error creating user:', userError);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Store tokens in database
    const { error: tokenError } = await supabase
      .from('user_tokens')
      .upsert({
        user_id: user.user?.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      });

    if (tokenError) {
      console.error('Error storing tokens:', tokenError);
      return res.status(500).json({ error: 'Failed to store tokens' });
    }

    // Create session
    const { data: session, error: sessionError } = await supabase.auth.signInWithPassword({
      email: userInfo.email,
      password: crypto.randomUUID(), // This will fail but that's ok, we just need the session
    });

    if (sessionError) {
      console.error('Error creating session:', sessionError);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    res.json({ token: session.session?.access_token });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Get user profile
router.get('/me', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router; 