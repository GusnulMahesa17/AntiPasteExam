export interface IntegrityMetrics {
  pasteCount: number;
  injectionCount: number;
  tabBlurCount?: number;
  totalKeystrokes?: number;
  charCount?: number;
}

export class IntegrityService {
  /**
   * Calculates answer-level integrity score (0 - 100)
   */
  public static calculateAnswerIntegrity(metrics: IntegrityMetrics): number {
    let score = 100;

    // Deduct 15 points for every paste attempt
    score -= (metrics.pasteCount || 0) * 15;

    // Deduct 25 points for every sudden large text injection
    score -= (metrics.injectionCount || 0) * 25;

    // Keystroke to character ratio sanity check
    if (metrics.charCount && metrics.charCount > 50) {
      const keystrokes = metrics.totalKeystrokes || 0;
      // If characters exist but almost zero keystrokes were recorded (and not caught by paste/injection)
      if (keystrokes < metrics.charCount * 0.3) {
        score -= 30;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculates overall submission integrity score
   */
  public static calculateOverallSubmissionScore(
    answerScores: number[],
    globalTabBlurCount: number = 0
  ): number {
    if (answerScores.length === 0) return 100;

    const avgAnswerScore = answerScores.reduce((sum, s) => sum + s, 0) / answerScores.length;
    
    // Tab blur penalty: 1 grace tab switch, then -5 pts per tab switch
    const blurPenalty = Math.max(0, globalTabBlurCount - 1) * 5;

    const finalScore = avgAnswerScore - blurPenalty;
    return Math.max(0, Math.min(100, Math.round(finalScore * 100) / 100));
  }
}
