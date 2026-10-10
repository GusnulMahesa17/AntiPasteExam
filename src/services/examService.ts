import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';

export class ExamService {
  public static async getTeacherExams(teacherId: number) {
    const [exams] = await pool.query<RowDataPacket[]>(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
              (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submission_count
       FROM exams e 
       WHERE e.teacher_id = ? 
       ORDER BY e.created_at DESC`,
      [teacherId]
    );
    return exams;
  }

  public static async getStudentExams(studentId: number) {
    const [exams] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.title, e.description, e.duration_minutes, e.start_time, e.end_time, e.created_at,
              u.name AS teacher_name,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
              s.id AS submission_id,
              s.status AS submission_status,
              s.overall_integrity_score
       FROM exams e
       JOIN users u ON e.teacher_id = u.id
       LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ?
       WHERE e.is_published = TRUE
       ORDER BY e.created_at DESC`,
      [studentId]
    );
    return exams;
  }

  public static async createExam(teacherId: number, data: any) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { title, description, duration_minutes, start_time, end_time, is_published, questions } = data;

      const [examResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO exams (teacher_id, title, description, duration_minutes, start_time, end_time, is_published)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          teacherId,
          title,
          description || '',
          duration_minutes || 60,
          start_time ? new Date(start_time) : null,
          end_time ? new Date(end_time) : null,
          is_published ? 1 : 0,
        ]
      );

      const examId = examResult.insertId;

      if (Array.isArray(questions) && questions.length > 0) {
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (q.question_text && q.question_text.trim()) {
            await connection.query(
              `INSERT INTO questions (exam_id, question_text, max_score, order_index)
               VALUES (?, ?, ?, ?)`,
              [examId, q.question_text, q.max_score || 100, i + 1]
            );
          }
        }
      }

      await connection.commit();
      return examId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public static async getExamDetails(examId: number, userId: number, userRole: string) {
    const [examRows] = await pool.query<RowDataPacket[]>(
      `SELECT e.*, u.name AS teacher_name 
       FROM exams e 
       JOIN users u ON e.teacher_id = u.id 
       WHERE e.id = ?`,
      [examId]
    );

    if (examRows.length === 0) {
      const error: any = new Error('Exam not found');
      error.statusCode = 404;
      throw error;
    }

    const exam = examRows[0];

    if (userRole === 'student' && !exam.is_published) {
      const error: any = new Error('This exam is not available');
      error.statusCode = 403;
      throw error;
    }

    const [questions] = await pool.query<RowDataPacket[]>(
      `SELECT id, question_text, max_score, order_index 
       FROM questions 
       WHERE exam_id = ? 
       ORDER BY order_index ASC`,
      [examId]
    );

    let submission = null;
    if (userRole === 'student') {
      const [subRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM submissions WHERE exam_id = ? AND student_id = ?`,
        [examId, userId]
      );
      if (subRows.length > 0) {
        submission = subRows[0];
      }
    }

    return { exam, questions, submission };
  }

  public static async updateExam(examId: number, teacherId: number, data: any) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { title, description, duration_minutes, start_time, end_time, is_published, questions } = data;

      const [exams] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM exams WHERE id = ? AND teacher_id = ?',
        [examId, teacherId]
      );

      if (exams.length === 0) {
        const error: any = new Error('Exam not found or unauthorized');
        error.statusCode = 404;
        throw error;
      }

      await connection.query(
        `UPDATE exams 
         SET title = ?, description = ?, duration_minutes = ?, start_time = ?, end_time = ?, is_published = ?
         WHERE id = ?`,
        [
          title,
          description || '',
          duration_minutes || 60,
          start_time ? new Date(start_time) : null,
          end_time ? new Date(end_time) : null,
          is_published ? 1 : 0,
          examId,
        ]
      );

      if (Array.isArray(questions)) {
        await connection.query('DELETE FROM questions WHERE exam_id = ?', [examId]);
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (q.question_text && q.question_text.trim()) {
            await connection.query(
              `INSERT INTO questions (exam_id, question_text, max_score, order_index)
               VALUES (?, ?, ?, ?)`,
              [examId, q.question_text, q.max_score || 100, i + 1]
            );
          }
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public static async deleteExam(examId: number, teacherId: number) {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM exams WHERE id = ? AND teacher_id = ?',
      [examId, teacherId]
    );

    if (result.affectedRows === 0) {
      const error: any = new Error('Exam not found or unauthorized');
      error.statusCode = 404;
      throw error;
    }
  }
}
