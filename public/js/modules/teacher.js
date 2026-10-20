/**
 * AntiPasteExam — Teacher Module (Dedicated Exam & Question Management Page)
 */
export function createTeacherModule(api, toast) {
  /** Convert a DB datetime string → HTML datetime-local value (YYYY-MM-DDTHH:MM) */
  function toDatetimeLocal(dbStr) {
    if (!dbStr) return '';
    const d = new Date(dbStr);
    if (isNaN(d.getTime())) return '';
    // Offset to local time for the input
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  }

  return {
    isEditingExam: false,
    examForm: {
      id: null,
      title: '',
      description: '',
      duration_minutes: 45,
      start_time: '',       // datetime-local string (YYYY-MM-DDTHH:MM), empty = no restriction
      end_time: '',         // datetime-local string, empty = no restriction
      access_key: '',       // optional passcode, empty = no key required
      is_published: false,
      questions: [{ question_text: '', max_score: 100 }],
    },
    currentSubmissionsList: [],
    selectedSubmission: null,

    openCreateExamPage() {
      this.isEditingExam = false;
      this.examForm = {
        id: null,
        title: '',
        description: '',
        duration_minutes: 45,
        start_time: '',
        end_time: '',
        access_key: '',
        is_published: false,
        questions: [{ question_text: '', max_score: 100 }],
      };
      return 'exam_editor';
    },

    async openEditExamPage(examId) {
      try {
        const data = await api(`/api/exams/${examId}`);

        // If exam is published, it is locked from editing
        if (data.exam.is_published) {
          toast('Published examinations are locked from editing to protect student submission authenticity.', 'error');
          return null;
        }

        this.isEditingExam = true;
        this.examForm = {
          id: data.exam.id,
          title: data.exam.title,
          description: data.exam.description || '',
          duration_minutes: data.exam.duration_minutes || 45,
          start_time: toDatetimeLocal(data.exam.start_time),
          end_time: toDatetimeLocal(data.exam.end_time),
          access_key: data.exam.access_key || '',
          is_published: false,
          questions: (data.questions && data.questions.length > 0)
            ? data.questions.map((q) => ({ question_text: q.question_text, max_score: q.max_score || 100 }))
            : [{ question_text: '', max_score: 100 }],
        };
        return 'exam_editor';
      } catch (err) {
        toast('Failed to load examination details', 'error');
        return null;
      }
    },

    addQuestionField() {
      this.examForm.questions.push({ question_text: '', max_score: 100 });
      toast('New essay question added', 'info');
    },

    removeQuestionField(index) {
      if (this.examForm.questions.length > 1) {
        this.examForm.questions.splice(index, 1);
        toast('Question removed', 'info');
      } else {
        toast('An examination must contain at least one question.', 'error');
      }
    },

    moveQuestionUp(index) {
      if (index > 0) {
        const temp = this.examForm.questions[index];
        this.examForm.questions[index] = this.examForm.questions[index - 1];
        this.examForm.questions[index - 1] = temp;
      }
    },

    moveQuestionDown(index) {
      if (index < this.examForm.questions.length - 1) {
        const temp = this.examForm.questions[index];
        this.examForm.questions[index] = this.examForm.questions[index + 1];
        this.examForm.questions[index + 1] = temp;
      }
    },

    duplicateQuestion(index) {
      const q = this.examForm.questions[index];
      this.examForm.questions.splice(index + 1, 0, {
        question_text: q.question_text,
        max_score: q.max_score,
      });
      toast('Question duplicated', 'info');
    },

    get totalScore() {
      return this.examForm.questions.reduce((sum, q) => sum + (Number(q.max_score) || 0), 0);
    },

    async saveExam(onSuccess, forcePublish = false) {
      if (!this.examForm.title.trim()) {
        toast('Please specify an examination title', 'error');
        return false;
      }

      // Validate all questions have text
      const hasEmpty = this.examForm.questions.some((q) => !q.question_text || !q.question_text.trim());
      if (hasEmpty) {
        toast('All questions must contain text before saving.', 'error');
        return false;
      }

      // Validate time window logic
      if (this.examForm.start_time && this.examForm.end_time) {
        if (new Date(this.examForm.start_time) >= new Date(this.examForm.end_time)) {
          toast('End time must be after start time.', 'error');
          return false;
        }
      }

      // forcePublish = true  → "Publish" button clicked
      // forcePublish = false → "Save Draft" button clicked — always stays draft
      const willPublish = forcePublish;

      if (willPublish) {
        if (this.examForm.questions.length === 0) {
          toast('Cannot publish an examination without at least one question.', 'error');
          return false;
        }
        const confirmPublish = confirm(
          'Are you sure you want to PUBLISH this examination?\n\n' +
          '• Students will immediately be able to take this exam.\n' +
          '• Once published, the exam CANNOT be edited again to protect submission authenticity.'
        );
        if (!confirmPublish) return false;
      }

      const payload = {
        ...this.examForm,
        is_published: willPublish,
        // Send null instead of empty string for optional datetime fields
        start_time: this.examForm.start_time || null,
        end_time: this.examForm.end_time || null,
        access_key: this.examForm.access_key?.trim() || null,
      };

      try {
        if (this.isEditingExam && this.examForm.id) {
          await api(`/api/exams/${this.examForm.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          toast(
            willPublish
              ? 'Examination published! Students can now take the exam.'
              : 'Draft saved. Continue editing whenever you\'re ready.',
            'success'
          );
        } else {
          const created = await api('/api/exams', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          // Track the newly created exam so later Save/Publish actions update
          // this record instead of inserting duplicate exams.
          if (created && created.examId) {
            this.examForm.id = created.examId;
            this.isEditingExam = true;
          }
          toast(
            willPublish
              ? 'Examination published! Students can now take the exam.'
              : 'Draft saved. You can edit and publish it later.',
            'success'
          );
        }
        if (onSuccess) onSuccess();
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    },

    async publishExamDirectly(examId, onSuccess) {
      const confirmPublish = confirm(
        'Are you sure you want to PUBLISH this examination?\n\n' +
        '• Students will immediately be able to access and start this exam.\n' +
        '• Once published, questions and settings CANNOT be edited again to preserve submission integrity.'
      );
      if (!confirmPublish) return;

      try {
        await api(`/api/exams/${examId}/publish`, { method: 'POST' });
        toast('Examination is now published and active for students.', 'success');
        if (onSuccess) onSuccess();
      } catch (err) {
        console.error(err);
      }
    },

    async deleteExam(id, onSuccess) {
      if (!confirm('Are you sure you want to delete this examination? All submissions and question history will be permanently deleted.')) {
        return;
      }
      try {
        await api(`/api/exams/${id}`, { method: 'DELETE' });
        toast('Examination deleted', 'info');
        if (onSuccess) onSuccess();
      } catch (err) {
        console.error(err);
      }
    },

    async loadExamSubmissions(examId) {
      const data = await api(`/api/submissions/exam/${examId}`);
      this.currentSubmissionsList = data.submissions || [];
      return data.exam;
    },

    async loadSubmissionAudit(submissionId) {
      const data = await api(`/api/submissions/${submissionId}`);
      this.selectedSubmission = data;
      return data;
    },
  };
}
