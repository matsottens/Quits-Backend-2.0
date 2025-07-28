import { google } from 'googleapis';
import jwt from 'jsonwebtoken';

async function exchangeCodeForToken(code, redirect_uri) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri
  );
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return { oauth2Client, tokens };
}

async function getUserInfo(oauth2Client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data;
}

export default async function handler(req, res) {
  const { code, state, redirect_uri = 'https://www.quits.cc/auth/callback' } = req.query;

  if (!code) {
    return res.status(400).json({ success: false, error: 'missing_code' });
  }

  try {
    const { oauth2Client, tokens } = await exchangeCodeForToken(code, redirect_uri);
    const userInfo = await getUserInfo(oauth2Client);

    const internalUserId = state && state.startsWith('uid:') ? state.substring(4) : userInfo.id;

    // Here you would typically upsert the user in your database
    // and handle account linking if internalUserId exists.
    // For this fix, we'll just generate a token.

    const token = jwt.sign(
      {
        id: internalUserId,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        // Add any other relevant claims
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({ success: true, token, user: { ...userInfo, id: internalUserId } });
  } catch (error) {
    console.error('Error in google-proxy:', error.message);
    return res.status(500).json({ success: false, error: 'auth_failed', message: error.message });
  }
} 