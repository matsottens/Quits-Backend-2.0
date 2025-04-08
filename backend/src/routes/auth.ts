import express from 'express';
import { google } from 'googleapis';
import { oauth2Client, SCOPES } from '../config/google.js';
import { supabase } from '../config/supabase.js';
import { authenticateUser, AuthRequest } from '../middleware/auth.js';
import { Request, Response } from 'express';
import { generateToken } from '../utils/jwt.js';
import { upsertUser } from '../services/database.js';

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
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const userInfo = await google.oauth2('v2').userinfo.get({
      auth: oauth2Client,
    });

    // Create or update user in database
    const user = await upsertUser(userInfo.data);

    // Generate JWT token
    const token = generateToken(user);

    // Clear any existing tokens
    oauth2Client.revokeCredentials();

    return res.json({ token });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.status(500).json({ error: 'Failed to authenticate with Google' });
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