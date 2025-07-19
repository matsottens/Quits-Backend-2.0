import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

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
    const payload: any = await verifyToken(token);
    if (!payload || !payload.id) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    req.user = {
      id: payload.id,
      email: payload.email || ''
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Export types and middleware
export { AuthRequest as AuthenticatedRequest }; 