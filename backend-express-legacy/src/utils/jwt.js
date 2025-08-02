// Using dynamic import for JWT to ensure it works in all environments
let jwt;

// Initialize JWT module
async function initJwt() {
  if (!jwt) {
    const module = await import('jsonwebtoken');
    jwt = module.default || module;
  }
  return jwt;
}

// JWT Secret key from environment variable
// Use a consistent fallback secret for development to avoid token validation issues
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn('WARNING: JWT_SECRET environment variable is not set. Using fallback secret - NOT SECURE FOR PRODUCTION!');
    return 'quits-jwt-secret-key-development';
  }
  return secret;
};

// Generate a JWT token
export const generateToken = async (payload) => {
  // Set token to expire in 7 days
  const jwtModule = await initJwt();
  const secret = getJwtSecret();
  
  // Ensure the 'sub' claim is set to the user's ID for Supabase RLS (auth.uid())
  const tokenPayload = {
    ...payload,
    sub: payload.id
  };

  console.log(`Generating JWT token with secret: ${secret.substring(0, 3)}... (${secret.length} chars)`);
  return jwtModule.sign(tokenPayload, secret, { expiresIn: '7d' });
};

// Verify a JWT token
export const verifyToken = async (token) => {
  try {
    const jwtModule = await initJwt();
    const secret = getJwtSecret();
    return jwtModule.verify(token, secret);
  } catch (error) {
    console.error('JWT verification error:', error.message);
    return null;
  }
}; 