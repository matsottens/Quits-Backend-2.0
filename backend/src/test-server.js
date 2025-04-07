import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Constants
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '82730443897-ji64k4jhk02lonkps5vu54e1q5opoq3g.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://quits.cc/auth/callback';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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'; // Should be set as an environment variable

// Middleware
app.use(cors({
  origin: ['https://quits.cc', 'https://www.quits.cc'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Google Auth endpoints
app.get('/api/auth/google/url', (req, res) => {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  
  url.search = new URLSearchParams({
    redirect_uri: GOOGLE_REDIRECT_URI,
    client_id: GOOGLE_CLIENT_ID,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/gmail.readonly'
  }).toString();
  
  res.json({ url: url.toString() });
});

// Google OAuth callback
app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ message: 'Authorization code is required' });
  }
  
  try {
    // Exchange the code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenResponse.status !== 200) {
      console.error('Token exchange error:', tokenData);
      return res.status(400).json({ message: 'Failed to exchange authorization code' });
    }
    
    // Fetch user info with the access token
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    
    const userData = await userInfoResponse.json();
    
    if (userInfoResponse.status !== 200) {
      console.error('User info error:', userData);
      return res.status(400).json({ message: 'Failed to fetch user information' });
    }
    
    // In a real app, you would create/update the user in your database here
    // and generate a session token or JWT for the frontend
    
    // For this test server, we'll just return the user data and tokens
    const jwtToken = 'test_jwt_token'; // In a real app, this would be a proper JWT
    
    // Redirect to frontend with token
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?token=${jwtToken}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ message: 'Authentication failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 