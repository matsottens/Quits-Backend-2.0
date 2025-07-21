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
    if (!payload || !payload.id) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    req.user = {
      id: payload.id,
      email: payload.email || ''
    };

    /* --- Resolve internal UUID (dbUserId) --- */
    try {
      let uuid: string | null = null;

      // google_id
      if (payload.id) {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('google_id', payload.id)
          .maybeSingle();
        if (data?.id) uuid = data.id;
      }

      // fallback email
      if (!uuid && payload.email) {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('email', payload.email)
          .maybeSingle();
        if (data?.id) uuid = data.id;
      }

      (req as any).dbUserId = uuid;
    } catch (e) {
      console.error('Failed to map Google ID to internal UUID:', e);
      (req as any).dbUserId = null;
    }
    /* ---------------------------------------- */

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Export types and middleware
export { AuthRequest as AuthenticatedRequest }; 