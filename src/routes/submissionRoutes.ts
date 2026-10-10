import { Router } from 'express';
import {
  startSubmission,
  saveAnswers,
  submitExam,
  getSubmissionById,
  getExamSubmissions,
} from '../controllers/submissionController.js';
import { authenticateJWT, requireRole } from '../middlewares/auth.js';

const router = Router();

router.use(authenticateJWT);

router.post('/start', requireRole('student'), startSubmission);
router.post('/save', requireRole('student'), saveAnswers);
router.post('/submit', requireRole('student'), submitExam);
router.get('/:id', getSubmissionById);
router.get('/exam/:examId', requireRole('teacher'), getExamSubmissions);

export default router;
