import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.js';
import { ExamService } from '../services/examService.js';

export const getExams = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const exams = user.role === 'teacher' 
      ? await ExamService.getTeacherExams(user.id)
      : await ExamService.getStudentExams(user.id);

    res.status(200).json({ exams });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to retrieve exams' });
  }
};

export const createExam = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const teacherId = req.user!.id;
    const { title } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const examId = await ExamService.createExam(teacherId, req.body);
    res.status(201).json({ message: 'Exam created successfully', examId });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create exam' });
  }
};

export const getExamById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const examId = parseInt(req.params.id as string, 10);
    const user = req.user!;

    const result = await ExamService.getExamDetails(examId, user.id, user.role);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to retrieve exam details' });
  }
};

export const updateExam = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const examId = parseInt(req.params.id as string, 10);
    const teacherId = req.user!.id;

    await ExamService.updateExam(examId, teacherId, req.body);
    res.status(200).json({ message: 'Exam updated successfully' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update exam' });
  }
};

export const deleteExam = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const examId = parseInt(req.params.id as string, 10);
    const teacherId = req.user!.id;

    await ExamService.deleteExam(examId, teacherId);
    res.status(200).json({ message: 'Exam deleted successfully' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete exam' });
  }
};
