import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUserPayload, UserRole } from '../types/index.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'anti_paste_exam_jwt_secret_key_2026_secure';

export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (allowedRoles: UserRole | UserRole[]) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Access denied. Requires role: ${roles.join(' or ')}` });
      return;
    }

    next();
  };
};
