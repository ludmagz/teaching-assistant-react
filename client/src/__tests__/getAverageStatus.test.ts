import { getAverageStatus } from '../utils/getAverageStatus';
import { GradingThresholds } from '../types/Class';

const thresholds = {
  minimumAverageToPass: 7,
  minimumAverageForFinalExam: 3
};

describe('getAverageStatus', () => {
  test.each([
    [10, 'approved'],
    [7, 'approved'],
    [6, 'final'],
    [3, 'final'],
    [2, 'failed'],
    [0, 'failed']
  ] as const)('classifies average %s as %s', (average, expected) => {
    expect(getAverageStatus(average, thresholds)).toBe(expected);
  });

  test.each([null, undefined])('does not classify a missing average (%s)', average => {
    expect(getAverageStatus(average, thresholds)).toBeNull();
  });

  test.each([null, undefined])('does not classify without thresholds (%s)', missingThresholds => {
    expect(getAverageStatus(7, missingThresholds)).toBeNull();
  });

  test.each([undefined, null])(
    'does not classify with a missing passing threshold (%s)', value => {
      // API responses can violate the TypeScript contract at runtime.
      const invalidThresholds = { ...thresholds, minimumAverageToPass: value } as unknown as GradingThresholds;
      expect(getAverageStatus(7, invalidThresholds)).toBeNull();
    }
  );

  test.each([undefined, null])(
    'does not classify with a missing final exam threshold (%s)', value => {
      const invalidThresholds = { ...thresholds, minimumAverageForFinalExam: value } as unknown as GradingThresholds;
      expect(getAverageStatus(7, invalidThresholds)).toBeNull();
    }
  );

  test('accepts zero as the final exam threshold', () => {
    expect(getAverageStatus(0, { ...thresholds, minimumAverageForFinalExam: 0 })).toBe('final');
  });

  test('uses the thresholds configured for the class', () => {
    const otherThresholds = {
      minimumAverageToPass: 8,
      minimumAverageForFinalExam: 5
    };

    expect(getAverageStatus(7, otherThresholds)).toBe('final');
    expect(getAverageStatus(3, otherThresholds)).toBe('failed');
    expect(getAverageStatus(8, otherThresholds)).toBe('approved');
  });
});
