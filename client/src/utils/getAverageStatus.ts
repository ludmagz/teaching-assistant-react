import { GradingThresholds } from '../types/Class';

export type AverageStatus = 'approved' | 'final' | 'failed';

export function getAverageStatus(
  average: number | null | undefined,
  thresholds: GradingThresholds | null | undefined
): AverageStatus | null {
  if (average == null || thresholds == null) {
    return null;
  }

  const { minimumAverageToPass, minimumAverageForFinalExam } = thresholds;

  if (
    minimumAverageToPass == null ||
    minimumAverageForFinalExam == null
  ) {
    return null;
  }

  if (average >= minimumAverageToPass) {
    return 'approved';
  }

  if (average >= minimumAverageForFinalExam) {
    return 'final';
  }

  return 'failed';
}
