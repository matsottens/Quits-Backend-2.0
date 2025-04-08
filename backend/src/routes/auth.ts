import express from 'express';
import { google } from 'googleapis';
import { oauth2Client, SCOPES } from '../config/google.js';
import { supabase } from '../config/supabase.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Generate Google OAuth URL
router.get('/google/url', (req, res) => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      include_granted_scopes: true
    });
    
    res.json({ url: authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    console.error('No code provided in callback');
    return res.redirect(`${process.env.CLIENT_URL}/login?error=no_code`);
  }
  
  try {
    console.log('Received auth code, attempting to exchange for tokens...');
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens || !tokens.access_token) {
      console.error('No tokens received from Google');
      return res.redirect(`${process.env.CLIENT_URL}/login?error=no_tokens`);
    }
    
    oauth2Client.setCredentials(tokens);
    
    console.log('Successfully exchanged code for tokens');
    
    // Get user info
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });
    
    const userInfo = await oauth2.userinfo.get();
    
    if (!userInfo.data.email) {
      console.error('No email found in user info');
      return res.redirect(`${process.env.CLIENT_URL}/login?error=no_email`);
    }
    
    console.log('Retrieved user info for:', userInfo.data.email);
    
    // Check if user exists in Supabase, if not create them
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select()
      .eq('email', userInfo.data.email)
      .single();
      
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Database error:', fetchError);
      return res.redirect(`${process.env.CLIENT_URL}/login?error=database_error`);
    }
    
    let userId;
    
    if (!existingUser) {
      console.log('Creating new user...');
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
        console.error('Failed to create user:', createError);
        return res.redirect(`${process.env.CLIENT_URL}/login?error=user_creation_failed`);
      }
      
      userId = newUser.id;
      console.log('New user created with ID:', userId);
    } else {
      userId = existingUser.id;
      console.log('Found existing user with ID:', userId);
      
      // Update existing user info
      const { error: updateError } = await supabase
        .from('users')
        .update({
          name: userInfo.data.name || existingUser.name,
          avatar_url: userInfo.data.picture || existingUser.avatar_url,
          last_login: new Date().toISOString(),
        })
        .eq('id', userId);
        
      if (updateError) {
        console.error('Failed to update user:', updateError);
      }
    }
    
    // Store tokens in user_tokens table
    const { error: tokenError } = await supabase
      .from('user_tokens')
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date,
      }, {
        onConflict: 'user_id'
      });
      
    if (tokenError) {
      console.error('Failed to store tokens:', tokenError);
      return res.redirect(`${process.env.CLIENT_URL}/login?error=token_storage_failed`);
    }
    
    // Create JWT for frontend auth
    const jwtToken = jwt.sign(
      { 
        id: userId,
        email: userInfo.data.email,
        name: userInfo.data.name,
        avatar_url: userInfo.data.picture
      },
      process.env.JWT_SECRET || 'quits-jwt-secret-key-development',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    console.log('Authentication successful, redirecting to frontend...');
    
    // Redirect to frontend with token
    const redirectUrl = new URL('/auth/callback', process.env.CLIENT_URL);
    redirectUrl.searchParams.append('token', jwtToken);
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Auth error:', error);
    // Redirect to frontend with error
    const redirectUrl = new URL('/login', process.env.CLIENT_URL);
    redirectUrl.searchParams.append('error', 'authentication_failed');
    redirectUrl.searchParams.append('details', error.message || 'Unknown error');
    res.redirect(redirectUrl.toString());
  }
});

export default router; 