import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import { IntegrityService } from './integrityService.js';

export class SubmissionService {
  public static async startExamSession(studentId: number, examId: number) {
    const [exams] = await pool.query<RowDataPacket[]>(
      'SELECT id, is_published, duration_minutes FROM exams WHERE id = ?',
      [examId]
    );

    if (exams.length === 0 || !exams[0].is_published) {
      const error: any = new Error('Exam not found or is not active/published');
      error.statusCode = 404;
      throw error;
    }

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM submissions WHERE exam_id = ? AND student_id = ?',
      [examId, studentId]
    );

    let submissionId: number;
    let submission: any;

    if (existing.length > 0) {
      submission = existing[0];
      submissionId = submission.id;

      if (submission.status === 'submitted') {
        const error: any = new Error('Exam has already been submitted');
        error.statusCode = 400;
        error.submission = submission;
        throw error;
      }
    } else {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO submissions (exam_id, student_id, started_at, status) VALUES (?, ?, NOW(), ?)',
        [examId, studentId, 'in_progress']
      );
      submissionId = result.insertId;

      const [newSub] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM submissions WHERE id = ?',
        [submissionId]
      );
      submission = newSub[0];
    }

    const [answers] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM answers WHERE submission_id = ?',
      [submissionId]
    );

    return { submission, answers };
  }

  public static async saveProgress(studentId: number, submissionId: number, answers: any[], events: any[], snapshots: any[]) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [subs] = await connection.query<RowDataPacket[]>(
        `SELECT s.id, s.status, e.is_published 
         FROM submissions s
         JOIN exams e ON s.exam_id = e.id
         WHERE s.id = ? AND s.student_id = ?`,
        [submissionId, studentId]
      );

      if (subs.length === 0) {
        const error: any = new Error('Submission not found or unauthorized');
        error.statusCode = 404;
        throw error;
      }

      if (!subs[0].is_published) {
        const error: any = new Error('This exam is not published and is not accepting answers');
        error.statusCode = 403;
        throw error;
      }

      if (subs[0].status === 'submitted') {
        const error: any = new Error('Cannot update an already submitted exam');
        error.statusCode = 400;
        throw error;
      }

      // 1. Save Answers & recalculate answer-level integrity
      if (Array.isArray(answers)) {
        for (const ans of answers) {
          const {
            question_id,
            content,
            total_keystrokes = 0,
            paste_count = 0,
            text_injection_count = 0,
            typing_duration_seconds = 0,
          } = ans;

          const charCount = content ? content.length : 0;
          const answerScore = IntegrityService.calculateAnswerIntegrity({
            pasteCount: paste_count,
            injectionCount: text_injection_count,
            totalKeystrokes: total_keystrokes,
            charCount,
          });

          await connection.query(
            `INSERT INTO answers 
              (submission_id, question_id, content, total_keystrokes, paste_count, text_injection_count, typing_duration_seconds, integrity_score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
              content = VALUES(content),
              total_keystrokes = VALUES(total_keystrokes),
              paste_count = VALUES(paste_count),
              text_injection_count = VALUES(text_injection_count),
              typing_duration_seconds = VALUES(typing_duration_seconds),
              integrity_score = VALUES(integrity_score)`,
            [
              submissionId,
              question_id,
              content || '',
              total_keystrokes,
              paste_count,
              text_injection_count,
              typing_duration_seconds,
              answerScore,
            ]
          );
        }
      }

      // 2. Save Security Events
      if (Array.isArray(events) && events.length > 0) {
        for (const ev of events) {
          const { question_id, event_type, event_data } = ev;
          if (event_type) {
            await connection.query(
              `INSERT INTO integrity_events (submission_id, question_id, event_type, event_data)
               VALUES (?, ?, ?, ?)`,
              [
                submissionId,
                question_id || null,
                event_type,
                event_data ? JSON.stringify(event_data) : null,
              ]
            );
          }
        }
      }

      // 3. Save Snapshots
      if (Array.isArray(snapshots) && snapshots.length > 0) {
        for (const snap of snapshots) {
          const { question_id, snapshot_text, char_count, keystrokes_delta, time_offset_seconds } = snap;

          const [ansRows] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM answers WHERE submission_id = ? AND question_id = ?',
            [submissionId, question_id]
          );

          if (ansRows.length > 0) {
            const answerId = ansRows[0].id;
            await connection.query(
              `INSERT INTO answer_snapshots (answer_id, snapshot_text, char_count, keystrokes_delta, time_offset_seconds)
               VALUES (?, ?, ?, ?, ?)`,
              [
                answerId,
                snapshot_text || '',
                char_count || 0,
                keystrokes_delta || 0,
                time_offset_seconds || 0,
              ]
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

  public static async finalizeSubmission(studentId: number, submissionId: number) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [subs] = await connection.query<RowDataPacket[]>(
        `SELECT s.id, s.status, e.is_published 
         FROM submissions s
         JOIN exams e ON s.exam_id = e.id
         WHERE s.id = ? AND s.student_id = ?`,
        [submissionId, studentId]
      );

      if (subs.length === 0) {
        const error: any = new Error('Submission not found');
        error.statusCode = 404;
        throw error;
      }

      if (!subs[0].is_published) {
        const error: any = new Error('Cannot submit to an unpublished examination');
        error.statusCode = 403;
        throw error;
      }

      const [answers] = await connection.query<RowDataPacket[]>(
        'SELECT integrity_score FROM answers WHERE submission_id = ?',
        [submissionId]
      );

      const [blurEvents] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS tab_blur_count FROM integrity_events 
         WHERE submission_id = ? AND event_type = 'tab_blur'`,
        [submissionId]
      );

      const answerScores = (answers as RowDataPacket[]).map((a: any) => Number(a.integrity_score || 100));
      const tabBlurCount = (blurEvents as RowDataPacket[])[0]?.tab_blur_count || 0;

      const overallScore = IntegrityService.calculateOverallSubmissionScore(
        answerScores,
        tabBlurCount
      );

      await connection.query(
        `UPDATE submissions 
         SET status = 'submitted', submitted_at = NOW(), overall_integrity_score = ?
         WHERE id = ?`,
        [overallScore, submissionId]
      );

      await connection.commit();
      return overallScore;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public static async getSubmissionAudit(submissionId: number, userId: number, userRole: string) {
    const [subRows] = await pool.query<RowDataPacket[]>(
      `SELECT s.*, e.title AS exam_title, e.teacher_id, e.duration_minutes,
              u.name AS student_name, u.email AS student_email
       FROM submissions s
       JOIN exams e ON s.exam_id = e.id
       JOIN users u ON s.student_id = u.id
       WHERE s.id = ?`,
      [submissionId]
    );

    if (subRows.length === 0) {
      const error: any = new Error('Submission not found');
      error.statusCode = 404;
      throw error;
    }

    const submission = subRows[0];

    if (userRole === 'student' && userId !== submission.student_id) {
      const error: any = new Error('Unauthorized to view this submission');
      error.statusCode = 403;
      throw error;
    }
    if (userRole === 'teacher' && userId !== submission.teacher_id) {
      const error: any = new Error('Unauthorized to view this submission');
      error.statusCode = 403;
      throw error;
    }

    const [answers] = await pool.query<RowDataPacket[]>(
      `SELECT a.*, q.question_text, q.max_score, q.order_index
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       WHERE a.submission_id = ?
       ORDER BY q.order_index ASC`,
      [submissionId]
    );

    const [events] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM integrity_events WHERE submission_id = ? ORDER BY detected_at ASC`,
      [submissionId]
    );

    const [snapshots] = await pool.query<RowDataPacket[]>(
      `SELECT sn.*, a.question_id
       FROM answer_snapshots sn
       JOIN answers a ON sn.answer_id = a.id
       WHERE a.submission_id = ?
       ORDER BY sn.time_offset_seconds ASC, sn.created_at ASC`,
      [submissionId]
    );

    return { submission, answers, events, snapshots };
  }

  public static async getExamSubmissions(examId: number, teacherId: number) {
    const [exams] = await pool.query<RowDataPacket[]>(
      'SELECT id, title FROM exams WHERE id = ? AND teacher_id = ?',
      [examId, teacherId]
    );

    if (exams.length === 0) {
      const error: any = new Error('Exam not found or unauthorized');
      error.statusCode = 404;
      throw error;
    }

    const [submissions] = await pool.query<RowDataPacket[]>(
      `SELECT s.*, u.name AS student_name, u.email AS student_email,
              (SELECT COUNT(*) FROM integrity_events ie WHERE ie.submission_id = s.id) AS total_events_count,
              (SELECT COUNT(*) FROM integrity_events ie WHERE ie.submission_id = s.id AND ie.event_type = 'paste_attempt') AS total_paste_count
       FROM submissions s
       JOIN users u ON s.student_id = u.id
       WHERE s.exam_id = ?
       ORDER BY s.submitted_at DESC, s.started_at DESC`,
      [examId]
    );

    return { exam: exams[0], submissions };
  }
}
