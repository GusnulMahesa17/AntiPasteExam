import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';

export class ExamService {
  public static async getTeacherExams(teacherId: number) {
    const [exams] = await pool.query<RowDataPacket[]>(
      `SELECT e.*,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
              (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submission_count,
              (e.access_key IS NOT NULL AND e.access_key != '') AS has_access_key
       FROM exams e
       WHERE e.teacher_id = ?
       ORDER BY e.created_at DESC`,
      [teacherId]
    );
    return exams;
  }

  public static async verifyExamKey(accessKey: string, studentId: number) {
    const cleanKey = (accessKey || '').trim();
    if (!cleanKey) {
      const error: any = new Error('Access key cannot be empty.');
      error.statusCode = 400;
      throw error;
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.title, e.description, e.duration_minutes,
              e.start_time, e.end_time, e.created_at,
              TRUE AS has_access_key,
              u.name AS teacher_name,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
              s.id AS submission_id,
              s.status AS submission_status,
              s.overall_integrity_score
       FROM exams e
       JOIN users u ON e.teacher_id = u.id
       LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ?
       WHERE e.is_published = TRUE AND LOWER(TRIM(e.access_key)) = LOWER(?)`,
      [studentId, cleanKey]
    );

    if (rows.length === 0) {
      const error: any = new Error('Invalid examination key. No active published exam matches this passcode.');
      error.statusCode = 404;
      throw error;
    }

    const exam = rows[0];
    const now = new Date();

    const isFlexibleTime = !exam.start_time;
    let windowState: 'open' | 'upcoming' | 'closed' = 'open';
    if (exam.start_time && new Date(exam.start_time) > now) {
      windowState = 'upcoming';
    } else if (exam.end_time && new Date(exam.end_time) < now) {
      windowState = 'closed';
    }

    return {
      ...exam,
      is_flexible_time: isFlexibleTime,
      window_state: windowState,
      can_start: windowState === 'open' && exam.submission_status !== 'submitted',
    };
  }

  public static async getStudentExams(studentId: number) {
    const [exams] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.title, e.description, e.duration_minutes,
              e.start_time, e.end_time, e.created_at,
              (e.access_key IS NOT NULL AND e.access_key != '') AS has_access_key,
              u.name AS teacher_name,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
              s.id AS submission_id,
              s.status AS submission_status,
              s.overall_integrity_score
       FROM exams e
       JOIN users u ON e.teacher_id = u.id
       LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ?
       WHERE e.is_published = TRUE
         AND (
           e.access_key IS NULL 
           OR TRIM(e.access_key) = '' 
           OR s.id IS NOT NULL
         )
       ORDER BY e.created_at DESC`,
      [studentId]
    );
    return exams;
  }

  public static async createExam(teacherId: number, data: any) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { title, description, duration_minutes, start_time, end_time, access_key, is_published, questions } = data;

      if (!title || !title.trim()) {
        const error: any = new Error('Title is required');
        error.statusCode = 400;
        throw error;
      }

      const willPublish = Boolean(is_published);
      if (willPublish && (!Array.isArray(questions) || questions.length === 0 || !questions[0]?.question_text?.trim())) {
        const error: any = new Error('Cannot publish an examination without at least one valid question.');
        error.statusCode = 400;
        throw error;
      }

      const cleanKey = access_key?.trim() || null;

      const [examResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO exams (teacher_id, title, description, duration_minutes, start_time, end_time, access_key, is_published)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          teacherId,
          title.trim(),
          description || '',
          duration_minutes || 60,
          start_time ? new Date(start_time) : null,
          end_time ? new Date(end_time) : null,
          cleanKey,
          willPublish ? 1 : 0,
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
              [examId, q.question_text.trim(), q.max_score || 100, i + 1]
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
      `SELECT e.*, u.name AS teacher_name,
              (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submission_count,
              (e.access_key IS NOT NULL AND e.access_key != '') AS has_access_key
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

    // Students can NEVER access unpublished exams
    if (userRole === 'student' && !exam.is_published) {
      const error: any = new Error('This exam is not published and cannot be accessed.');
      error.statusCode = 403;
      throw error;
    }

    // Strip the raw access_key for students (only expose the boolean flag)
    if (userRole === 'student') {
      delete exam.access_key;
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

      const { title, description, duration_minutes, start_time, end_time, access_key, is_published, questions } = data;

      const [exams] = await connection.query<RowDataPacket[]>(
        `SELECT id, is_published,
                (SELECT COUNT(*) FROM submissions WHERE exam_id = ?) AS submission_count
         FROM exams
         WHERE id = ? AND teacher_id = ?`,
        [examId, examId, teacherId]
      );

      if (exams.length === 0) {
        const error: any = new Error('Exam not found or unauthorized');
        error.statusCode = 404;
        throw error;
      }

      const existingExam = exams[0];

      // Critical Rule: Once published or when submissions exist, the exam CANNOT be edited!
      if (existingExam.is_published || existingExam.submission_count > 0) {
        const error: any = new Error('Published examinations cannot be edited to preserve submission authenticity.');
        error.statusCode = 400;
        throw error;
      }

      const willPublish = Boolean(is_published);
      if (willPublish && (!Array.isArray(questions) || questions.length === 0 || !questions[0]?.question_text?.trim())) {
        const error: any = new Error('Cannot publish an examination without at least one valid question.');
        error.statusCode = 400;
        throw error;
      }

      const cleanKey = access_key?.trim() || null;

      await connection.query(
        `UPDATE exams
         SET title = ?, description = ?, duration_minutes = ?, start_time = ?, end_time = ?, access_key = ?, is_published = ?
         WHERE id = ?`,
        [
          title.trim(),
          description || '',
          duration_minutes || 60,
          start_time ? new Date(start_time) : null,
          end_time ? new Date(end_time) : null,
          cleanKey,
          willPublish ? 1 : 0,
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
              [examId, q.question_text.trim(), q.max_score || 100, i + 1]
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

  public static async publishExam(examId: number, teacherId: number) {
    const [exams] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.is_published,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count
       FROM exams e
       WHERE e.id = ? AND e.teacher_id = ?`,
      [examId, teacherId]
    );

    if (exams.length === 0) {
      const error: any = new Error('Exam not found or unauthorized');
      error.statusCode = 404;
      throw error;
    }

    const exam = exams[0];
    if (exam.is_published) {
      return; // Already published
    }

    if (exam.question_count === 0) {
      const error: any = new Error('Cannot publish an examination without at least one question.');
      error.statusCode = 400;
      throw error;
    }

    await pool.query('UPDATE exams SET is_published = 1 WHERE id = ?', [examId]);
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
