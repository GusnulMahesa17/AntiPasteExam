import { Router } from 'express';
import { getExams, createExam, getExamById, updateExam, publishExam, deleteExam } from '../controllers/examController.js';
import { authenticateJWT, requireRole } from '../middlewares/auth.js';

const router = Router();

router.use(authenticateJWT);

router.get('/', getExams);
router.post('/', requireRole('teacher'), createExam);
router.get('/:id', getExamById);
router.put('/:id', requireRole('teacher'), updateExam);
router.post('/:id/publish', requireRole('teacher'), publishExam);
router.delete('/:id', requireRole('teacher'), deleteExam);

export default router;
