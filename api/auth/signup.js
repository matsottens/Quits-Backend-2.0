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
  }

  try {
    const { email, password, name } = req.body;
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
      }
    });

  } catch (error) {
    console.error('[signup] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
} 