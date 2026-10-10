export type UserRole = 'teacher' | 'student';

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

export interface AuthUserPayload {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export interface Exam {
  id: number;
  teacher_id: number;
  title: string;
  description?: string;
  duration_minutes: number;
  start_time?: Date | null;
  end_time?: Date | null;
  is_published: boolean;
  created_at: Date;
}

export interface Question {
  id: number;
  exam_id: number;
  question_text: string;
  max_score: number;
  order_index: number;
  created_at: Date;
}

export type SubmissionStatus = 'in_progress' | 'submitted';

export interface Submission {
  id: number;
  exam_id: number;
  student_id: number;
  started_at: Date;
  submitted_at?: Date | null;
  status: SubmissionStatus;
  overall_integrity_score: number;
}

export interface Answer {
  id: number;
  submission_id: number;
  question_id: number;
  content: string;
  total_keystrokes: number;
  paste_count: number;
  text_injection_count: number;
  typing_duration_seconds: number;
  integrity_score: number;
  created_at: Date;
  updated_at: Date;
}

export type IntegrityEventType = 'paste_attempt' | 'large_injection' | 'tab_blur' | 'tab_focus' | 'right_click';

export interface IntegrityEvent {
  id: number;
  submission_id: number;
  question_id?: number | null;
  event_type: IntegrityEventType;
  event_data: any;
  detected_at: Date;
}

export interface AnswerSnapshot {
  id: number;
  answer_id: number;
  snapshot_text: string;
  char_count: number;
  keystrokes_delta: number;
  time_offset_seconds: number;
  created_at: Date;
}
