export type RelativePerformance =
  | 'BELOW_AVERAGE'
  | 'AT_AVERAGE'
  | 'ABOVE_AVERAGE';

export function comparePerformance(
  studentAverage: number | null,
  classAverage: number | null
): RelativePerformance | null {
  if (
    studentAverage === null ||
    classAverage === null ||
    !Number.isFinite(studentAverage) ||
    !Number.isFinite(classAverage)
  ) {
    return null;
  }

  if (studentAverage === classAverage) {
    return 'AT_AVERAGE';
  }

  return studentAverage < classAverage ? 'BELOW_AVERAGE' : 'ABOVE_AVERAGE';
}
