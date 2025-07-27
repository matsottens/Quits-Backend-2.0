<<<<<<< HEAD
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
=======
import crypto from 'crypto';
import jsonwebtoken from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const { sign } = jsonwebtoken;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Password hashing function using Node.js crypto
async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
  }

  try {
    const { token, password } = req.body;

<<<<<<< HEAD
    if (!token || !password) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }

    // Find and validate reset token
    const { data: resetToken, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('user_id, expires_at')
      .eq('token', token)
      .single();

    if (tokenError || !resetToken) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    // Check if token is expired
    if (new Date() > new Date(resetToken.expires_at)) {
      res.status(400).json({ error: 'Reset token has expired' });
      return;
    }

    // Hash new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Update user's password
    const { data: user, error: updateError } = await supabase
      .from('users')
      .update({ password_hash })
      .eq('id', resetToken.user_id)
      .select('id, email, name')
      .single();

    if (updateError || !user) {
      console.error('Error updating password:', updateError);
      res.status(500).json({ error: 'Failed to update password' });
      return;
    }

    // Delete the used token
    await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('token', token);

    // Generate new JWT
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Password reset successful',
      token: jwtToken,
=======
    // Validate required fields
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    // Validate password strength (minimum 6 characters)
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Find user by reset token
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, reset_token, reset_token_expires_at')
      .eq('reset_token', token)
      .single();

    if (fetchError) {
      console.error('Error fetching user by reset token:', fetchError);
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token is expired
    if (user.reset_token_expires_at && new Date(user.reset_token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Hash the new password using Node.js crypto
    const hashedPassword = await hashPassword(password);

    // Update user password and clear reset token
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: hashedPassword,
        reset_token: null,
        reset_token_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    // Generate JWT token for automatic login
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    const authToken = sign(
      { 
        id: user.id, 
        email: user.email,
        name: user.name
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Return success response
    return res.status(200).json({
      success: true,
      token: authToken,
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('Reset password error:', error);
<<<<<<< HEAD
    res.status(500).json({ error: 'Internal server error' });
=======
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
  }
} 