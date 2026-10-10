import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { initDatabase } from './config/db.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Attempt database initialization
    await initDatabase();
  } catch (err) {
    console.warn('⚠️ Warning: Database initialization failed. Check your MySQL connection credentials in .env');
  }

  app.listen(PORT, () => {
    console.log(`🚀 AntiPasteExam Server running on http://localhost:${PORT}`);
  });
};

startServer();