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
    
    if (!payload) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Set basic user info
    req.user = {
      id: payload.id || payload.sub, // Fallback to sub if id not present
      email: payload.email || ''
    };

    // Determine the internal database UUID for queries
    // Priority: 1) payload.sub (recommended), 2) payload.id if it's a UUID, 3) fallback
    let dbUserId = null;
    
    if (payload.sub) {
      dbUserId = payload.sub;
    } else if (payload.id && /^[0-9a-fA-F-]{36}$/.test(payload.id)) {
      // If payload.id looks like a UUID, use it
      dbUserId = payload.id;
    }
    
    (req as any).dbUserId = dbUserId;

    // Log auth success with minimal info for debugging
    console.log(`Auth success: user ${payload.email}, dbUserId: ${dbUserId ? 'present' : 'missing'}`);

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Export types and middleware
export { AuthRequest as AuthenticatedRequest }; 