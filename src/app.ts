import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import examRoutes from './routes/examRoutes.js';
import submissionRoutes from './routes/submissionRoutes.js';
import { createTemplateEngine } from './utils/template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Application = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend assets (index disabled — the shell is assembled from views/)
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath, { index: false }));

// Server-rendered HTML shell composed from views/partials
const viewsPath = path.join(__dirname, '../views');
const template = createTemplateEngine(viewsPath);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/submissions', submissionRoutes);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the assembled application shell at the root
app.get('/', (_req: Request, res: Response) => {
  res.type('html').send(template.render('index.html'));
});

// Fallback for SPA routing
app.use((req: Request, res: Response, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.type('html').send(template.render('index.html'));
});

export default app;