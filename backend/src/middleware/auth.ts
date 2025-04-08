import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    avatar_url?: string;
  };
}

export const authenticateUser = async (req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Token verification error:', error);
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Set user data in request
    req.user = {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name,
      avatar_url: user.user_metadata?.avatar_url
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Export types and middleware
export { AuthRequest as AuthenticatedRequest }; 