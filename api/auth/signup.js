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
  console.log('[signup] ===== SIGNUP REQUEST RECEIVED =====');
  console.log('[signup] Method:', req.method);
  console.log('[signup] Headers:', Object.keys(req.headers));
  console.log('[signup] Body:', req.body);
  console.log('[signup] Environment variables check:');
  console.log('[signup] - SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('[signup] - SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
  console.log('[signup] - JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'MISSING');

  // Apply shared CORS headers
  setCorsHeaders(req, res);
  
  if (req.method === 'OPTIONS') {
    console.log('[signup] OPTIONS request, returning 200');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    console.log('[signup] Invalid method:', req.method);
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

// Password verification function
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
    const { email, password, name } = req.body;
<<<<<<< HEAD
    console.log('[signup] Extracted data:', { email: email ? 'PRESENT' : 'MISSING', password: password ? 'PRESENT' : 'MISSING', name });

    if (!email || !password) {
      console.log('[signup] Missing required fields:', { email: !!email, password: !!password });
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    console.log('[signup] Checking if user already exists...');
    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[signup] Error checking existing user:', checkError);
      res.status(500).json({ error: 'Database error checking existing user' });
      return;
    }

    if (existingUser) {
      console.log('[signup] User already exists:', email);
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    console.log('[signup] User does not exist, creating new user...');
    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email,
        name: name || email.split('@')[0],
        password_hash,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[signup] Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user', details: error.message });
      return;
    }

    console.log('[signup] User created successfully, generating JWT...');
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

    console.log('[signup] JWT generated, returning success response');
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
=======

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength (minimum 6 characters)
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Hash the password using Node.js crypto
    const hashedPassword = await hashPassword(password);

    // Check if user already exists by email OR google_id
    const { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('id, email, google_id, password_hash')
      .or(`email.eq.${email},google_id.eq.${email}`);

    if (checkError) {
      console.error('Error checking existing user:', checkError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (existingUsers && existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      
      // If user exists with same email but no password_hash (Google-only user)
      if (existingUser.email === email && !existingUser.password_hash) {
        console.log(`Found Google-only user with email ${email}, adding password to existing account`);
        
        // Update existing user with password
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            password_hash: hashedPassword,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUser.id)
          .select('id, email, name')
          .single();

        if (updateError) {
          console.error('Error updating user with password:', updateError);
          return res.status(500).json({ error: 'Failed to update user' });
        }

        // Generate JWT token for merged account
        const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
        const token = sign(
          { 
            id: updatedUser.id, 
            email: updatedUser.email,
            name: updatedUser.name
          },
          jwtSecret,
          { expiresIn: '7d' }
        );

        return res.status(200).json({
          success: true,
          token: token,
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name
          },
          message: 'Account successfully linked with existing Google account'
        });
      }
      
      // If user exists with password_hash, it's a duplicate
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Create new user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        email: email,
        name: name || email.split('@')[0],
        password_hash: hashedPassword,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, email, name')
      .single();

    if (createError) {
      console.error('Error creating user:', createError);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    const token = sign(
      { 
        id: newUser.id, 
        email: newUser.email,
        name: newUser.name
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Return success response
    return res.status(201).json({
      success: true,
      token: token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
      }
    });

  } catch (error) {
<<<<<<< HEAD
    console.error('[signup] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
=======
    console.error('Signup error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
  }
} 