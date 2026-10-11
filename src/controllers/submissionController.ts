import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { SubmissionService } from '../services/submissionService.js';

export const startSubmission = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.id;
    const { exam_id, access_key } = req.body;

    if (!exam_id) {
      res.status(400).json({ error: 'exam_id is required' });
      return;
    }

    const { submission, answers } = await SubmissionService.startExamSession(studentId, exam_id, access_key || '');

    res.status(200).json({
      message: 'Exam session active',
      submission,
      answers,
    });
  } catch (error: any) {
    if (error.submission) {
      res.status(error.statusCode || 400).json({ error: error.message, submission: error.submission });
      return;
    }
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to start exam session' });
  }
};

export const saveAnswers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.id;
    const { submission_id, answers, events, snapshots } = req.body;

    if (!submission_id) {
      res.status(400).json({ error: 'submission_id is required' });
      return;
    }

    await SubmissionService.saveProgress(studentId, submission_id, answers, events, snapshots);
    res.status(200).json({ message: 'Progress saved successfully' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to save exam progress' });
  }
};

export const submitExam = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.id;
    const { submission_id } = req.body;

    if (!submission_id) {
      res.status(400).json({ error: 'submission_id is required' });
      return;
    }

    const overallScore = await SubmissionService.finalizeSubmission(studentId, submission_id);

    res.status(200).json({
      message: 'Exam submitted successfully',
      overall_integrity_score: overallScore,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to submit exam' });
  }
};

export const getSubmissionById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const submissionId = parseInt(req.params.id as string, 10);
    const user = req.user!;

    const result = await SubmissionService.getSubmissionAudit(submissionId, user.id, user.role);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to retrieve submission details' });
  }
};

export const getExamSubmissions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const examId = parseInt(req.params.examId as string, 10);
    const user = req.user!;

    const result = await SubmissionService.getExamSubmissions(examId, user.id);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to retrieve submissions' });
  }
};
