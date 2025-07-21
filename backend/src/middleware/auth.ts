import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { supabase } from '../config/supabase.js';

export interface AuthRequest extends Request {
  // Explicitly specify common properties so TypeScript recognises them even with strict express@5 typings
  headers: any;   // IncomingHttpHeaders
  body: any;
  params: any;
  query: any;
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
    const payload: any = await verifyToken(token);
    // The 'sub' claim holds our internal database UUID. This is the source of truth.
    if (!payload || !payload.sub) {
      return res.status(403).json({ error: 'Invalid token payload' });
    }

    req.user = {
      id: payload.id, // This is the Google ID, which can be useful elsewhere
      email: payload.email || ''
    };

    // Attach the internal database UUID to the request for use in queries.
    (req as any).dbUserId = payload.sub;

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Export types and middleware
export { AuthRequest as AuthenticatedRequest }; 