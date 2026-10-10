import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'anti_paste_exam',
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Create a pool for application queries
export const pool = mysql.createPool(dbConfig);

// Initialize database tables & seed initial demo data
export const initDatabase = async (): Promise<void> => {
  try {
    // Connect without database first to ensure database exists
    const rootConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
    await rootConnection.end();

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      const connection = await pool.getConnection();
      try {
        await connection.query(schemaSql);
        console.log('✅ Database schema initialized successfully');

        // Seed demo accounts if not present
        const [users] = await connection.query<any[]>('SELECT id, email FROM users LIMIT 2');
        if (users.length === 0) {
          const passwordHash = await bcrypt.hash('password123', 10);
          
          // Seed teacher
          const [teacherResult]: any = await connection.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            ['Prof. Alex Johnson', 'teacher@demo.com', passwordHash, 'teacher']
          );

          // Seed student
          await connection.query(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            ['Jane Doe', 'student@demo.com', passwordHash, 'student']
          );

          // Seed a sample exam
          const teacherId = teacherResult.insertId;
          const [examResult]: any = await connection.query(
            `INSERT INTO exams (teacher_id, title, description, duration_minutes, is_published) 
             VALUES (?, ?, ?, ?, ?)`,
            [
              teacherId,
              'Modern History & Ethics Midterm Exam',
              'Please answer the following essay questions with your own thoughts and analysis. All copy/paste actions are monitored.',
              45,
              1,
            ]
          );

          const examId = examResult.insertId;
          await connection.query(
            `INSERT INTO questions (exam_id, question_text, max_score, order_index) VALUES 
             (?, 'Analyze the impact of the Industrial Revolution on urban society and workers rights.', 100, 1),
             (?, 'Explain the ethical considerations of artificial intelligence in modern education.', 100, 2)`,
            [examId, examId]
          );

          console.log('🌱 Seeded demo accounts and sample exam successfully!');
        }
      } finally {
        connection.release();
      }
    }
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
  }
};
