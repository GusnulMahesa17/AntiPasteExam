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
      // View name is derived from the server-rendered page URL.
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

      // Join exam by key workflow state
      studentJoinKey: '',
      verifiedExam: null,
      isVerifyingKey: false,
      keyVerificationError: '',

      // Modal state for student access key prompt
      keyModal: {
        isOpen: false,
        examId: null,
        examTitle: '',
        inputKey: '',
        error: '',
      },

      async init() {
        // Initialize telemetry engine with context
        this.telemetry = createTelemetryEngine(this, toast);

        // Listen for global toasts
        window.addEventListener('app-toast', (e) => {
          this.showToast(e.detail.message, e.detail.type);
        });

        await this.initializePage();
      },

      async initializePage() {
        const pathname = window.location.pathname;
        const teacherEdit = pathname.match(/^\/teacher\/exams\/(\d+)\/edit$/);
        const teacherSubmissions = pathname.match(/^\/teacher\/exams\/(\d+)\/submissions$/);
        const studentExam = pathname.match(/^\/student\/exams\/(\d+)$/);
        const submissionAudit = pathname.match(/^\/submissions\/(\d+)$/);

        if (pathname === '/') this.currentView = 'landing';
        else if (pathname === '/teacher/dashboard') this.currentView = 'dashboard';
        else if (pathname === '/teacher/exams/new' || teacherEdit) this.currentView = 'exam_editor';
        else if (teacherSubmissions) this.currentView = 'teacher_submissions';
        else if (pathname === '/student/dashboard') this.currentView = 'dashboard';
        else if (studentExam) this.currentView = 'exam_room';
        else if (submissionAudit) this.currentView = 'submission_audit';
        else {
          window.location.replace('/');
          return;
        }

        if (!this.auth.token || !this.auth.user) {
          if (pathname !== '/') window.location.replace('/');
          return;
        }

        if (pathname === '/') {
          this.navigateToDashboard();
          return;
        }

        const requiredRole = pathname.startsWith('/teacher/') ? 'teacher'
          : pathname.startsWith('/student/') ? 'student'
            : null;
        if (requiredRole && this.user.role !== requiredRole) {
          this.navigateToDashboard();
          return;
        }

        if (this.currentView === 'dashboard') {
          await this.fetchExams();
        } else if (this.currentView === 'exam_editor') {
          if (teacherEdit) {
            const view = await this.teacher.openEditExamPage(Number(teacherEdit[1]));
            if (!view) this.navigateToDashboard();
          } else {
            this.teacher.openCreateExamPage();
          }
        } else if (this.currentView === 'teacher_submissions') {
          this.activeExam = await this.teacher.loadExamSubmissions(Number(teacherSubmissions[1]));
        } else if (this.currentView === 'submission_audit') {
          await this.teacher.loadSubmissionAudit(Number(submissionAudit[1]));
        } else if (this.currentView === 'exam_room') {
          try {
            this.activeExam = await this.student.startExamSession(
              Number(studentExam[1]),
              this.telemetry,
              this.examAccessKeys[studentExam[1]] || ''
            );
            const startedAt = new Date(this.activeSubmission.started_at).getTime();
            const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            this.telemetry.startSession(
              this.activeExam.duration_minutes,
              (isBackground) => this.student.saveDraft(this.telemetry, isBackground),
              elapsedSeconds
            );
          } catch (error) {
            this.showToast(error.message || 'Unable to resume this examination.', 'error');
            this.navigateToDashboard();
          }
        }
      },

      navigateToDashboard() {
        const route = this.user?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
        window.location.assign(route);
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
      get studentAnswers() { return this.student?.studentAnswers || {}; },
      get activeSubmission() { return this.student?.activeSubmission || null; },
      get examAccessKeys() { return this.student?.examAccessKeys || {}; },
      get examTimerSeconds() { return this.telemetry?.examTimerSeconds || 0; },
      get saveStatusText() { return this.telemetry?.saveStatusText || 'All changes saved'; },

      // --------------- Auth Actions ---------------
      async handleAuth() {
        const user = await this.auth.handleAuth();
        if (user) {
          window.location.assign(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
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
          window.location.assign(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
        } else {
          // Auto-register demo account
          this.auth.authMode = 'register';
          const regUser = await this.auth.handleAuth();
          if (regUser) {
            window.location.assign(regUser.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
          }
        }
      },

      logout() {
        this.auth.logout();
        if (this.telemetry) this.telemetry.stopSession();
        window.location.assign('/');
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
        this.teacher.openCreateExamPage();
        window.location.assign('/teacher/exams/new');
      },

      async openEditExamPage(examId) {
        window.location.assign(`/teacher/exams/${examId}/edit`);
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
            window.location.assign('/teacher/dashboard');
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
        window.location.assign(`/teacher/exams/${examId}/submissions`);
      },

      async openSubmissionAudit(submissionId) {
        window.location.assign(`/submissions/${submissionId}`);
      },

      // --------------- Student Actions ---------------
      async verifyAndUnlockExam(keyToVerify) {
        const key = (keyToVerify !== undefined ? keyToVerify : this.studentJoinKey || '').trim();
        if (!key) {
          this.keyVerificationError = 'Please enter an examination access key.';
          return;
        }

        this.isVerifyingKey = true;
        this.keyVerificationError = '';

        try {
          const verified = await this.student.verifyAccessKey(key);
          this.verifiedExam = verified;
          this.studentJoinKey = key;
          this.examAccessKeys[verified.id] = key;
          
          // Also update or add to exams list if not already present
          const existingIdx = this.exams.findIndex((e) => e.id === verified.id);
          if (existingIdx !== -1) {
            this.exams[existingIdx] = { ...this.exams[existingIdx], ...verified };
          } else {
            this.exams.unshift(verified);
          }

          this.showToast(`Found: "${verified.title}"`, 'success');
        } catch (err) {
          console.error('Failed to verify access key:', err);
          this.verifiedExam = null;
          this.keyVerificationError = err.message || 'Invalid examination key. Please check and try again.';
          this.showToast(this.keyVerificationError, 'error');
        } finally {
          this.isVerifyingKey = false;
        }
      },

      clearVerifiedExam() {
        this.verifiedExam = null;
        this.studentJoinKey = '';
        this.keyVerificationError = '';
      },

      async startVerifiedExam() {
        if (!this.verifiedExam) return;
        const exam = this.verifiedExam;
        const key = this.studentJoinKey || this.examAccessKeys[exam.id] || '';
        await this.startExam(exam.id, key);
      },

      async startExam(examId, key = '') {
        const exam = this.exams.find((e) => e.id === examId) || (this.verifiedExam?.id === examId ? this.verifiedExam : null);
        
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
          this.student.rememberAccessKey(examId, keyToUse);
          window.location.assign(`/student/exams/${examId}`);
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

      openPasscodeModal(exam = null) {
        this.keyModal = {
          isOpen: true,
          examId: exam ? exam.id : null,
          examTitle: exam ? exam.title : 'Access Examination',
          inputKey: exam ? (this.examAccessKeys[exam.id] || '') : (this.studentJoinKey || ''),
          error: '',
        };
      },

      openAccessKeyModal(exam) {
        this.openPasscodeModal(exam);
      },

      closeAccessKeyModal() {
        this.keyModal.isOpen = false;
        this.keyModal.error = '';
      },

      async submitAccessKeyModal() {
        const key = (this.keyModal.inputKey || '').trim();
        if (!key) {
          this.keyModal.error = 'Please enter an examination passcode.';
          return;
        }

        try {
          const verified = await this.student.verifyAccessKey(key);
          this.verifiedExam = verified;
          this.studentJoinKey = key;
          this.examAccessKeys[verified.id] = key;

          // Add or update exam in student exams list
          const existingIdx = this.exams.findIndex((e) => e.id === verified.id);
          if (existingIdx !== -1) {
            this.exams[existingIdx] = { ...this.exams[existingIdx], ...verified };
          } else {
            this.exams.unshift(verified);
          }

          this.closeAccessKeyModal();
          this.showToast(`Passcode verified! Examination unlocked: "${verified.title}"`, 'success');

          setTimeout(() => {
            document.getElementById('unlocked-exam-section')?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        } catch (err) {
          this.keyModal.error = err.message || 'Invalid examination passcode. Please check with your teacher.';
        }
      },

      handlePasteAttempt(e, qId) { if (this.telemetry) this.telemetry.handlePasteAttempt(e, qId); },
      handleKeyDown(e, qId) { if (this.telemetry) this.telemetry.handleKeyDown(e, qId); },
      handleInput(e, qId) { if (this.telemetry) this.telemetry.handleInput(e, qId); },

      async saveExamProgress(isBackground = false) {
        await this.student.saveDraft(this.telemetry, isBackground);
      },

      async submitFinalExam() {
        const submissionId = await this.student.finalizeSubmission(this.telemetry);
        if (submissionId) {
          window.location.assign(`/submissions/${submissionId}`);
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
