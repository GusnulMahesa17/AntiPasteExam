import { apiRequest } from './utils/api.js';
import { createAuthModule } from './modules/auth.js';
import { createTeacherModule } from './modules/teacher.js';
import { createStudentModule } from './modules/student.js';
import { createTelemetryEngine } from './modules/telemetry.js';

/**
 * Main Alpine.js application data factory.
 * Registered before Alpine initializes via the alpine:init event.
 */
function defineApp() {
  window.Alpine.data('app', () => {
    // Helper to perform API calls with current auth token
    let authModule;
    const api = (url, options) => apiRequest(url, options, authModule?.token, (msg, type) => {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: msg, type } }));
    });
    const toast = (msg, type = 'info') => {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: msg, type } }));
    };

    authModule = createAuthModule(api, toast);
    const teacherModule = createTeacherModule(api, toast);
    const studentModule = createStudentModule(api, toast);

    const appState = {
      // Views: 'dashboard' | 'exam_editor' | 'exam_room' | 'teacher_submissions' | 'submission_audit'
      currentView: 'dashboard',
      toast: { show: false, message: '', type: 'info' },
      exams: [],
      activeExam: null,
      isLoading: false,

      // Concrete initialized sub-modules
      auth: authModule,
      teacher: teacherModule,
      student: studentModule,
      telemetry: null,

      // Modal state for student access key prompt
      keyModal: {
        isOpen: false,
        examId: null,
        examTitle: '',
        inputKey: '',
        error: '',
      },

      init() {
        // Initialize telemetry engine with context
        this.telemetry = createTelemetryEngine(this, toast);

        // Listen for global toasts
        window.addEventListener('app-toast', (e) => {
          this.showToast(e.detail.message, e.detail.type);
        });

        if (this.auth.token && this.auth.user) {
          this.fetchExams();
        }
      },

      showToast(message, type = 'info') {
        this.toast = { show: true, message, type };
        setTimeout(() => {
          this.toast.show = false;
        }, 4500);
      },

      // --------------- Proxied Getters/Setters ---------------
      get user() { return this.auth?.user || null; },
      get token() { return this.auth?.token || ''; },
      get authMode() { return this.auth?.authMode || 'login'; },
      set authMode(v) { if (this.auth) this.auth.authMode = v; },
      get authForm() { return this.auth?.authForm || { name: '', email: '', password: '', role: 'student' }; },
      get isEditingExam() { return this.teacher?.isEditingExam || false; },
      get examForm() {
        return this.teacher?.examForm || {
          id: null, title: '', description: '', duration_minutes: 45, is_published: false, questions: []
        };
      },
      get totalScore() { return this.teacher?.totalScore || 0; },
      get currentSubmissionsList() { return this.teacher?.currentSubmissionsList || []; },
      get selectedSubmission() { return this.teacher?.selectedSubmission || null; },
      get auditSnapshotIndex() { return this.teacher?.auditSnapshotIndex || 0; },
      set auditSnapshotIndex(v) { if (this.teacher) this.teacher.auditSnapshotIndex = v; },
      get isReplaying() { return this.teacher?.isReplaying || false; },
      get studentAnswers() { return this.student?.studentAnswers || {}; },
      get activeSubmission() { return this.student?.activeSubmission || null; },
      get examAccessKeys() { return this.student?.examAccessKeys || {}; },
      get examTimerSeconds() { return this.telemetry?.examTimerSeconds || 0; },
      get saveStatusText() { return this.telemetry?.saveStatusText || 'All changes saved'; },

      // --------------- Auth Actions ---------------
      async handleAuth() {
        const user = await this.auth.handleAuth();
        if (user) {
          this.currentView = 'dashboard';
          this.fetchExams();
        }
      },

      fillDemoCredentials(role) {
        this.auth.fillDemoCredentials(role);
      },

      async loginOrRegisterDemo(role) {
        this.auth.fillDemoCredentials(role);
        this.auth.authMode = 'login';
        // Try login first; if it fails, register then login
        const user = await this.auth.handleAuth();
        if (user) {
          this.currentView = 'dashboard';
          this.fetchExams();
        } else {
          // Auto-register demo account
          this.auth.authMode = 'register';
          const regUser = await this.auth.handleAuth();
          if (regUser) {
            this.currentView = 'dashboard';
            this.fetchExams();
          }
        }
      },

      logout() {
        this.auth.logout();
        if (this.telemetry) this.telemetry.stopSession();
        this.currentView = 'dashboard';
        this.exams = [];
        this.activeExam = null;
      },

      // --------------- Exams Listing ---------------
      async fetchExams() {
        this.isLoading = true;
        try {
          const data = await apiRequest('/api/exams', {}, this.auth?.token, this.showToast.bind(this));
          this.exams = data.exams || [];
        } catch (err) {
          console.error('Failed to fetch exams:', err);
        } finally {
          this.isLoading = false;
        }
      },

      // --------------- Teacher Actions ---------------
      openCreateExamPage() {
        this.currentView = this.teacher.openCreateExamPage();
      },

      async openEditExamPage(examId) {
        const view = await this.teacher.openEditExamPage(examId);
        if (view) this.currentView = view;
      },

      addQuestionField() { this.teacher.addQuestionField(); },
      removeQuestionField(idx) { this.teacher.removeQuestionField(idx); },
      moveQuestionUp(idx) { this.teacher.moveQuestionUp(idx); },
      moveQuestionDown(idx) { this.teacher.moveQuestionDown(idx); },
      duplicateQuestion(idx) { this.teacher.duplicateQuestion(idx); },

      async saveExam(publish = false) {
        const success = await this.teacher.saveExam(this.fetchExams.bind(this), publish);
        if (success) {
          if (publish) {
            // Only navigate back after publishing (exam is now locked)
            this.currentView = 'dashboard';
          }
          // For draft saves, stay on the editor page so teacher can keep editing
        }
      },

      async publishExam(id) {
        await this.teacher.publishExamDirectly(id, this.fetchExams.bind(this));
      },

      async deleteExam(id) {
        await this.teacher.deleteExam(id, this.fetchExams.bind(this));
      },

      async viewSubmissions(examId) {
        this.activeExam = await this.teacher.loadExamSubmissions(examId);
        this.currentView = 'teacher_submissions';
      },

      async openSubmissionAudit(submissionId) {
        await this.teacher.loadSubmissionAudit(submissionId);
        this.currentView = 'submission_audit';
      },

      togglePlayback() { this.teacher.togglePlayback(); },

      // --------------- Student Actions ---------------
      async startExam(examId, key = '') {
        const exam = this.exams.find((e) => e.id === examId);
        
        // Check window status
        if (exam) {
          const win = this.getExamWindowStatus(exam);
          if (win.state === 'upcoming') {
            this.showToast('This exam has not started yet. ' + win.message, 'error');
            return;
          }
          if (win.state === 'closed') {
            this.showToast('This exam is closed and is no longer accepting submissions.', 'error');
            return;
          }

          // If exam requires access key and none is provided yet, prompt via modal
          if (exam.has_access_key && !key && !this.examAccessKeys[examId]) {
            this.openAccessKeyModal(exam);
            return;
          }
        }

        try {
          const keyToUse = key || this.examAccessKeys[examId] || '';
          this.activeExam = await this.student.startExamSession(examId, this.telemetry, keyToUse);
          this.currentView = 'exam_room';
          this.telemetry.startSession(
            this.activeExam.duration_minutes,
            (isBg) => this.student.saveDraft(this.telemetry, isBg)
          );
          this.showToast('Examination session active. Anti-paste telemetry is running.', 'info');
        } catch (err) {
          console.error('Failed to start exam:', err);
          // If error was incorrect access key, reopen modal with error
          if (exam && exam.has_access_key) {
            this.keyModal.isOpen = true;
            this.keyModal.examId = exam.id;
            this.keyModal.examTitle = exam.title;
            this.keyModal.error = err.message || 'Incorrect access key';
          }
        }
      },

      openAccessKeyModal(exam) {
        this.keyModal = {
          isOpen: true,
          examId: exam.id,
          examTitle: exam.title,
          inputKey: this.examAccessKeys[exam.id] || '',
          error: '',
        };
      },

      closeAccessKeyModal() {
        this.keyModal.isOpen = false;
        this.keyModal.error = '';
      },

      async submitAccessKeyModal() {
        if (!this.keyModal.inputKey.trim()) {
          this.keyModal.error = 'Please enter the access key.';
          return;
        }
        const examId = this.keyModal.examId;
        const key = this.keyModal.inputKey.trim();
        this.examAccessKeys[examId] = key;
        this.closeAccessKeyModal();
        await this.startExam(examId, key);
      },

      handlePasteAttempt(e, qId) { if (this.telemetry) this.telemetry.handlePasteAttempt(e, qId); },
      handleKeyDown(e, qId) { if (this.telemetry) this.telemetry.handleKeyDown(e, qId); },
      handleInput(e, qId) { if (this.telemetry) this.telemetry.handleInput(e, qId); },

      async saveExamProgress(isBackground = false) {
        await this.student.saveDraft(this.telemetry, isBackground);
      },

      async submitFinalExam() {
        const submissionId = await this.student.finalizeSubmission(
          this.telemetry,
          this.activeExam.duration_minutes
        );
        if (submissionId) {
          await this.openSubmissionAudit(submissionId);
        }
      },

      formatTime(sec) {
        return this.telemetry ? this.telemetry.formatTime(sec) : '00:00';
      },

      formatDateTime(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      },

      getExamWindowStatus(exam) {
        if (!exam) return { state: 'open', message: 'Open' };
        const now = new Date();
        if (exam.start_time && new Date(exam.start_time) > now) {
          return {
            state: 'upcoming',
            message: 'Opens ' + this.formatDateTime(exam.start_time)
          };
        }
        if (exam.end_time && new Date(exam.end_time) < now) {
          return {
            state: 'closed',
            message: 'Closed on ' + this.formatDateTime(exam.end_time)
          };
        }
        if (exam.end_time) {
          return {
            state: 'closing_soon',
            message: 'Closes ' + this.formatDateTime(exam.end_time)
          };
        }
        return { state: 'open', message: 'Always available' };
      },
    };

    return appState;
  });
}

// Register BEFORE Alpine initializes — alpine:init fires before Alpine processes x-data
document.addEventListener('alpine:init', defineApp);
