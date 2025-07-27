<<<<<<< HEAD
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setCorsHeaders } from '../cors-middleware.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Use shared CORS headers (mirrors request origin, allows credentials)
  setCorsHeaders(req, res);
  
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

// Password verification function using Node.js crypto
async function verifyPassword(password, hash) {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString('hex'));
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
    const { email, password } = req.body;

<<<<<<< HEAD
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, password_hash')
      .eq('email', email)
      .single();

    if (error || !user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Check if user has a password hash (not OAuth-only account)
    if (!user.password_hash) {
      res.status(400).json({ 
        error: 'This account was created with Google. Please use "Login with Google" or set a password first.' 
      });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate JWT
    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name
    };
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
=======
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email or google_id
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, password_hash, google_id')
      .or(`email.eq.${email},google_id.eq.${email}`);

    if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    // Check if user has a password hash (email/password user)
    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account was created with Google. Please use Google sign-in.' });
    }

    // Verify password using Node.js crypto
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    const token = sign(
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
      token: token,
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
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