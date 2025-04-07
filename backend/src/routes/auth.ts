import express from 'express';
import { google } from 'googleapis';
import { oauth2Client, SCOPES } from '../config/google.js';
import { supabase } from '../config/supabase.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Generate Google OAuth URL
router.get('/google/url', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  
  res.json({ url: authUrl });
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Invalid authorization code' });
  }
  
  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });
    
    const userInfo = await oauth2.userinfo.get();
    
    if (!userInfo.data.email) {
      return res.status(400).json({ error: 'Email not found in user info' });
    }
    
    // Check if user exists in Supabase, if not create them
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select()
      .eq('email', userInfo.data.email)
      .single();
      
    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Database error' });
    }
    
    let userId;
    
    if (!existingUser) {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email: userInfo.data.email,
          name: userInfo.data.name || '',
          avatar_url: userInfo.data.picture || '',
          google_id: userInfo.data.id,
        })
        .select()
        .single();
        
      if (createError) {
        return res.status(500).json({ error: 'Failed to create user' });
      }
      
      userId = newUser.id;
    } else {
      userId = existingUser.id;
      
      // Update existing user info
      await supabase
        .from('users')
        .update({
          name: userInfo.data.name || existingUser.name,
          avatar_url: userInfo.data.picture || existingUser.avatar_url,
        })
        .eq('id', userId);
    }
    
    // Store tokens in user_tokens table
    await supabase
      .from('user_tokens')
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date,
      });
    
    // Create JWT for frontend auth
    const jwtToken = jwt.sign(
      { 
        sub: userId, 
        email: userInfo.data.email 
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    // Redirect to frontend with token
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${jwtToken}`);
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

export default router; 