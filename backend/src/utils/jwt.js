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
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Generate a JWT token
export const generateToken = async (payload) => {
  // Set token to expire in 7 days
  const jwtModule = await initJwt();
  return jwtModule.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

// Verify a JWT token
export const verifyToken = async (token) => {
  try {
    const jwtModule = await initJwt();
    return jwtModule.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}; 