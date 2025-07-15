import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    
    // Verify token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET || 'default_secret') as any;
    
    if (!decodedToken || !decodedToken.sub) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    
    // Check if user exists in database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', decodedToken.sub)
      .single();
      
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    
    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}; 