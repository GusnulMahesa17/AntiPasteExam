import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import { AuthUserPayload, UserRole } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'anti_paste_exam_jwt_secret_key_2026_secure';

export class AuthService {
  public static async registerUser(name: string, email: string, password: string, role: string) {
    const assignedRole: UserRole = role === 'teacher' ? 'teacher' : 'student';

    const [existingUsers] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      const error: any = new Error('User with this email already exists');
      error.statusCode = 409;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, assignedRole]
    );

    const payload: AuthUserPayload = {
      id: result.insertId,
      email,
      name,
      role: assignedRole,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    return { user: payload, token };
  }

  public static async loginUser(email: string, password: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const payload: AuthUserPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    return { user: payload, token };
  }

  public static async getUserById(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return rows[0];
  }
}
