import { createClient } from '@supabase/supabase-js';
<<<<<<< HEAD
import { v4 as uuidv4 } from 'uuid';

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

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    const { email } = req.body;

<<<<<<< HEAD
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (error || !user) {
      // Don't reveal if user exists for security
      res.status(200).json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
      return;
    }

    // Generate reset token
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Store reset token
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token: resetToken,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error storing reset token:', insertError);
      res.status(500).json({ error: 'Failed to generate reset token' });
      return;
    }

    // TODO: Send email with reset link
    // For now, return the token in development mode
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent.',
      ...(isDevelopment && { resetToken, resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}` })
=======
    // Validate required fields
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if user exists
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching user:', fetchError);
      return res.status(500).json({ error: 'Database error' });
    }

    // Always return success to prevent email enumeration
    // Don't reveal whether the email exists or not
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.status(200).json({ 
        success: true, 
        message: 'If an account with this email exists, a password reset link has been sent.' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Store reset token in database
    const { error: updateError } = await supabase
      .from('users')
      .update({
        reset_token: resetToken,
        reset_token_expires_at: resetTokenExpiry.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error storing reset token:', updateError);
      return res.status(500).json({ error: 'Failed to process password reset' });
    }

    // TODO: Send email with reset link
    // For now, just log the token (in production, send via email service)
    console.log(`Password reset token for ${email}: ${resetToken}`);
    console.log(`Reset link: https://www.quits.cc/reset-password?token=${resetToken}`);

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'If an account with this email exists, a password reset link has been sent.'
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
    });

  } catch (error) {
    console.error('Forgot password error:', error);
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