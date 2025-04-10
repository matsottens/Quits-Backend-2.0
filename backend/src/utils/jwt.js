import jwt from 'jsonwebtoken';

// JWT Secret key from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Generate a JWT token
export const generateToken = (payload) => {
  // Set token to expire in 7 days
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

// Verify a JWT token
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}; 