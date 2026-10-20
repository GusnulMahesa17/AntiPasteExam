/**
 * AntiPasteExam — Anti-Paste & Real-Time Telemetry Engine
 */
export function createTelemetryEngine(context, toast) {
  let timerInterval = null;
  let autoSaveInterval = null;

  return {
    pendingEvents: [],
    examTimerSeconds: 0,
    saveStatusText: 'All changes saved',
    lastContentLength: {},

    startSession(durationMinutes, onAutoSave) {
      this.stopSession();
      this.examTimerSeconds = durationMinutes * 60;
      this.pendingEvents = [];

      // Session countdown timer
      timerInterval = setInterval(() => {
        if (this.examTimerSeconds > 0) {
          this.examTimerSeconds--;
        }

        // Increment active typing duration for questions with content
        if (context.studentAnswers) {
          Object.keys(context.studentAnswers).forEach((qId) => {
            if (context.studentAnswers[qId].content && context.studentAnswers[qId].content.length > 0) {
              context.studentAnswers[qId].typing_duration_seconds += 1;
            }
          });
        }
      }, 1000);

      // Periodic auto-save (every 10s)
      autoSaveInterval = setInterval(() => {
        if (onAutoSave) onAutoSave(true);
      }, 10000);

      // Window focus/blur listeners
      window.onblur = () => {
        if (context.currentView === 'exam_room') {
          this.pendingEvents.push({
            event_type: 'tab_blur',
            event_data: { timestamp: new Date().toISOString() },
          });
          toast('Warning: Leaving the exam tab is recorded in your integrity log!', 'error');
        }
      };

      window.onfocus = () => {
        if (context.currentView === 'exam_room') {
          this.pendingEvents.push({
            event_type: 'tab_focus',
            event_data: { timestamp: new Date().toISOString() },
          });
        }
      };
    },

    stopSession() {
      if (timerInterval) clearInterval(timerInterval);
      if (autoSaveInterval) clearInterval(autoSaveInterval);
      window.onblur = null;
      window.onfocus = null;
    },

    handlePasteAttempt(event, questionId) {
      event.preventDefault(); // Block paste action
      if (!context.studentAnswers[questionId]) return;

      const ans = context.studentAnswers[questionId];
      ans.paste_count += 1;

      const clipboardData = event.clipboardData || window.clipboardData;
      const pastedText = clipboardData ? clipboardData.getData('text') : '';

      this.pendingEvents.push({
        question_id: questionId,
        event_type: 'paste_attempt',
        event_data: {
          attempted_length: pastedText.length,
          preview: pastedText.substring(0, 40),
          timestamp: new Date().toISOString(),
        },
      });

      toast('Direct paste action intercepted. Please articulate your answer manually.', 'error');
    },

    handleKeyDown(event, questionId) {
      if (!context.studentAnswers[questionId]) return;
      const ans = context.studentAnswers[questionId];
      if (!['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) {
        ans.total_keystrokes += 1;
      }
    },

    handleInput(event, questionId) {
      if (!context.studentAnswers[questionId]) return;
      const ans = context.studentAnswers[questionId];
      const prevLen = this.lastContentLength[questionId] || 0;
      const currentLen = ans.content.length;
      const delta = currentLen - prevLen;

      // Detect sudden burst text insertion (> 20 chars inserted at once)
      if (delta > 20) {
        ans.text_injection_count += 1;
        this.pendingEvents.push({
          question_id: questionId,
          event_type: 'large_injection',
          event_data: {
            delta_characters: delta,
            timestamp: new Date().toISOString(),
          },
        });
        toast('Sudden large text insertion detected and flagged.', 'error');
      }

      this.lastContentLength[questionId] = currentLen;
    },

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },
  };
}
