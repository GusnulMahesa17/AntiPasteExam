/**
 * AntiPasteExam — Student Module
 */
export function createStudentModule(api, toast) {
  return {
    studentAnswers: {},
    activeSubmission: null,
    examAccessKeys: {},   // keyed by exam.id — stores the student's typed access key per exam

    async startExamSession(examId, telemetry, accessKey = '') {
      const examDetails = await api(`/api/exams/${examId}`);
      const activeExam = examDetails.exam;
      activeExam.questions = examDetails.questions;

      const keyToSend = (accessKey || this.examAccessKeys[examId] || '').trim();

      const subData = await api('/api/submissions/start', {
        method: 'POST',
        body: JSON.stringify({
          exam_id: examId,
          access_key: keyToSend,
        }),
      });

      this.activeSubmission = subData.submission;

      // Populate student answers structure from existing progress (resume support)
      this.studentAnswers = {};
      activeExam.questions.forEach((q) => {
        const existing = subData.answers?.find((a) => a.question_id === q.id);
        this.studentAnswers[q.id] = {
          question_id: q.id,
          content: existing ? existing.content : '',
          total_keystrokes: existing ? existing.total_keystrokes : 0,
          paste_count: existing ? existing.paste_count : 0,
          text_injection_count: existing ? existing.text_injection_count : 0,
          typing_duration_seconds: existing ? existing.typing_duration_seconds : 0,
        };
        telemetry.lastContentLength[q.id] = existing ? existing.content.length : 0;
      });

      return activeExam;
    },

    async saveDraft(telemetry, isBackground = false) {
      if (!this.activeSubmission) return;

      telemetry.saveStatusText = 'Saving...';
      try {
        const answersArray = Object.values(this.studentAnswers);
        const eventsToSend = [...telemetry.pendingEvents];
        const snapshotsToSend = [...telemetry.pendingSnapshots];

        telemetry.pendingEvents = [];
        telemetry.pendingSnapshots = [];

        await api('/api/submissions/save', {
          method: 'POST',
          body: JSON.stringify({
            submission_id: this.activeSubmission.id,
            answers: answersArray,
            events: eventsToSend,
            snapshots: snapshotsToSend,
          }),
        });

        telemetry.saveStatusText = 'All changes saved';
        if (!isBackground) {
          toast('Examination draft saved', 'success');
        }
      } catch (err) {
        telemetry.saveStatusText = 'Save failed';
      }
    },

    async finalizeSubmission(telemetry, durationMinutes) {
      if (!confirm('Are you sure you want to finalize and submit your examination? Answers cannot be edited afterward.')) {
        return null;
      }

      telemetry.captureSnapshots(durationMinutes);
      await this.saveDraft(telemetry, true);

      const result = await api('/api/submissions/submit', {
        method: 'POST',
        body: JSON.stringify({ submission_id: this.activeSubmission.id }),
      });

      telemetry.stopSession();
      toast(`Examination submitted. Integrity Score: ${result.overall_integrity_score}%`, 'success');
      return this.activeSubmission.id;
    },
  };
}
