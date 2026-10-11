# AntiPasteExam

> **Write, Don't Paste.**

AntiPasteExam is a modern web-based examination platform designed to encourage authentic student responses by tracking answer input behavior and detecting paste-related activities.

---

## Features

- **JWT Authentication & Roles**: Support for **Teacher** and **Student** accounts.
- **Exam Management & Scheduling**:
  - Teachers can create, configure, update, and publish essay examinations with custom time limits.
  - **Access Key / Passcode Protection**: Teachers can set an optional exam key; students must enter the passcode to unlock and begin the assessment.
  - **Date & Time Access Window**: Set specific start date/time (when the exam opens) and end date/time (when the exam closes).
- **Student Exam Workspace**: Distraction-free exam room with countdown timer, autosave, and character/keystroke meters.
- **Anti-Paste & Integrity Engine**:
  - Intercepts & blocks clipboard paste events.
  - Detects sudden large text injections (anomalous burst inserts).
  - Tracks browser tab switching & blur events.
  - Captures incremental answer snapshots over time.
- **Forensic Audit Inspector**:
  - Computes an **Academic Integrity Score** ($0 - 100\%$).
  - **Visual Typing Playback**: Teachers can scrub through snapshots to replay how the essay was constructed step-by-step.
  - Security events log with exact timestamps.

---

## Tech Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: MySQL (`mysql2` pool with auto-initialization schema)
- **Frontend**: HTML5, Vanilla CSS (Glassmorphism design), JavaScript, Alpine.js

---

## Getting Started

### 1. Configure Environment Variables
Edit `.env` to match your MySQL database settings:
```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=anti_paste_exam

JWT_SECRET=anti_paste_exam_jwt_secret_key_2026_secure
JWT_EXPIRES_IN=7d
```

### 2. Run the Development Server
```bash
npm run dev
```

### 3. Open in Browser
Visit [http://localhost:3000](http://localhost:3000) to access the application.
You can use the **Quick Demo** buttons on the login screen to quickly sign in as:
- **Demo Teacher** (`teacher@demo.com`)
- **Demo Student** (`student@demo.com`)
