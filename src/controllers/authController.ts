import { Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import { AuthenticatedRequest } from '../middlewares/auth.js';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required' });
      return;
    }

    const { user, token } = await AuthService.registerUser(name, email, password, role);

    res.status(201).json({
      message: 'Registration successful',
      user,
      token,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error during registration' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const { user, token } = await AuthService.loginUser(email, password);

    res.status(200).json({
      message: 'Login successful',
      user,
      token,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error during login' });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await AuthService.getUserById(req.user.id);
    res.status(200).json({ user });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to retrieve profile' });
  }
};

export const logout = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ message: 'Logout successful' });
};
