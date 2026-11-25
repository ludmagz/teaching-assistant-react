import {
  AverageCalculationSpecification,
  DEFAULT_AVERAGE_CALCULATION_SPECIFICATION,
  roundUpToOneDecimal
} from '../models/AverageCalculationSpecification';
import { Evaluation, EVALUATION_GOALS, EvaluationGrade } from '../models/Evaluation';

/**
 * Class (unit) tests for the average calculation models: the rules a
 * professor configures for a class and the averages they produce.
 */

/** One evaluation per goal, in the order of EVALUATION_GOALS; '-' means no grade. */
const evaluationsOf = (grades: (EvaluationGrade | '-')[]): Evaluation[] =>
  grades.flatMap((grade, index) => grade === '-' ? [] : [new Evaluation(EVALUATION_GOALS[index], grade)]);

const simple = () => AverageCalculationSpecification.forModel('simple', { minimumAverageToPass: 7, minimumAverageForFinalExam: 3 });
const weighted = (goalWeights: Record<string, number>) =>
  AverageCalculationSpecification.forModel('weighted', { minimumAverageToPass: 7, minimumAverageForFinalExam: 3, goalWeights });
const concepts = () => AverageCalculationSpecification.forModel('concepts');

const weightsOf = (values: number[]) => Object.fromEntries(EVALUATION_GOALS.map((goal, index) => [goal, values[index]]));

describe('AverageCalculationSpecification rules', () => {
  test('a class has no model until the professor defines one', () => {
    expect(DEFAULT_AVERAGE_CALCULATION_SPECIFICATION.getModel()).toBeNull();
    expect(DEFAULT_AVERAGE_CALCULATION_SPECIFICATION.getGradingThresholds()).toBeNull();
  });

  test('the simple model stores both averages and the same weight for every goal', () => {
    const specification = simple();
    expect(specification.getModel()).toBe('simple');
    expect(specification.getGradingThresholds()).toEqual({ minimumAverageToPass: 7, minimumAverageForFinalExam: 3 });
    expect(Object.values(specification.toJSON().goalWeights)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  test('the weighted model stores the given weights', () => {
    const specification = weighted(weightsOf([1, 1, 1, 1, 1, 5]));
    expect(specification.getModel()).toBe('weighted');
    expect(Object.values(specification.toJSON().goalWeights)).toEqual([1, 1, 1, 1, 1, 5]);
  });

  test('the concepts model has no weights and no averages to classify students', () => {
    const specification = AverageCalculationSpecification.forModel('concepts', { minimumAverageToPass: 7, minimumAverageForFinalExam: 3 });
    expect(specification.getModel()).toBe('concepts');
    expect(specification.getMinimumAverageToPass()).toBeNull();
    expect(specification.getMinimumAverageForFinalExam()).toBeNull();
    expect(specification.getGradingThresholds()).toBeNull();
    expect(Object.values(specification.toJSON().goalWeights)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  test.each([11.5, -1, null])('rejects the passing average %s', minimumAverageToPass => {
    expect(() => AverageCalculationSpecification.forModel('simple', { minimumAverageToPass, minimumAverageForFinalExam: 3 }))
      .toThrow('The passing average must be between 0 and 10');
  });

  test('requires the minimum average for the final exam in the numeric models', () => {
    expect(() => AverageCalculationSpecification.forModel('simple', { minimumAverageToPass: 7 }))
      .toThrow('The minimum average for the final exam is required');
  });

  test.each([8, -1])('rejects %s as the minimum average for the final exam when the passing average is 7', minimumAverageForFinalExam => {
    expect(() => AverageCalculationSpecification.forModel('simple', { minimumAverageToPass: 7, minimumAverageForFinalExam }))
      .toThrow('The minimum average for the final exam must be between 0 and the passing average');
  });

  test('accepts a minimum average for the final exam equal to the passing average', () => {
    expect(AverageCalculationSpecification.forModel('simple', { minimumAverageToPass: 7, minimumAverageForFinalExam: 7 })
      .getGradingThresholds()).toEqual({ minimumAverageToPass: 7, minimumAverageForFinalExam: 7 });
  });

  test('rejects weights that do not sum to 10 in the weighted model', () => {
    expect(() => weighted(weightsOf([1, 3, 3, 4, 1, 5]))).toThrow('The sum of the goal weights must be 10');
  });

  test('requires a non-negative weight for every goal in the weighted model', () => {
    expect(() => weighted({ Requirements: 10 })).toThrow('A non-negative weight is required for every goal');
    expect(() => weighted(weightsOf([-1, 1, 1, 1, 1, 7]))).toThrow('A non-negative weight is required for every goal');
  });
});

describe('AverageCalculationSpecification JSON', () => {
  test('without a model, keeps the format of previous versions', () => {
    expect(Object.keys(DEFAULT_AVERAGE_CALCULATION_SPECIFICATION.toJSON())).toEqual(['gradeWeights', 'goalWeights']);
  });

  test.each([
    ['simple', simple],
    ['weighted', () => weighted(weightsOf([1, 1, 1, 1, 1, 5]))],
    ['concepts', concepts]
  ])('round-trips the %s model', (_model, build) => {
    const json = build().toJSON();
    expect(AverageCalculationSpecification.fromJSON(json).toJSON()).toEqual(json);
  });

  test('reads data without a model as a class with no rules defined', () => {
    const specification = AverageCalculationSpecification.fromJSON({ gradeWeights: { MA: 10 }, goalWeights: { Design: 1 } });
    expect(specification.getModel()).toBeNull();
  });
});

describe('AverageCalculationSpecification.calculateRoundedAverage', () => {
  test('is not available while the class has no model', () => {
    expect(DEFAULT_AVERAGE_CALCULATION_SPECIFICATION.calculateRoundedAverage(evaluationsOf([10, 10, 10, 10, 10, 10]))).toBeNull();
  });

  test('is not available while a goal has no grade', () => {
    expect(simple().calculateRoundedAverage(evaluationsOf([10, 9, 8, 6, 6, '-']))).toBeNull();
    expect(concepts().calculateRoundedAverage(evaluationsOf(['MPA', 'MPA', 'MPA', 'MPA', '-', 'MPA']))).toBeNull();
  });

  test('is the mean in the simple model, rounded up to one decimal place', () => {
    // 41 / 6 = 6.83
    expect(simple().calculateRoundedAverage(evaluationsOf([10, 9, 8, 6, 6, 2]))).toBe(6.9);
  });

  test('is the weighted mean in the weighted model', () => {
    // (1x10 + 1x9 + 1x8 + 1x6 + 1x6 + 5x2) / 10 = 4.9
    expect(weighted(weightsOf([1, 1, 1, 1, 1, 5])).calculateRoundedAverage(evaluationsOf([10, 9, 8, 6, 6, 2]))).toBe(4.9);
  });

  test('is not available when a grade does not belong to the model', () => {
    expect(simple().calculateRoundedAverage(evaluationsOf([10, 9, 8, 6, 6, 'MA']))).toBeNull();
    expect(concepts().calculateRoundedAverage(evaluationsOf(['MA', 'MA', 'MA', 'MA', 'MA', 10]))).toBeNull();
  });

  test.each([
    // some MANA and at least 60% of MA or MPA (professor's rule RQ6)
    [['MA', 'MANA', 'MA', 'MPA', 'MA', 'MA'], 6.5],
    [['MANA', 'MANA', 'MPA', 'MPA', 'MPA', 'MPA'], 6.5],
    // some MANA and less than 60% of MA or MPA: 10 x the share of MA or MPA
    [['MANA', 'MANA', 'MANA', 'MA', 'MA', 'MA'], 5],
    [['MANA', 'MANA', 'MANA', 'MANA', 'MA', 'MA'], 3.4],
    [['MANA', 'MANA', 'MANA', 'MANA', 'MANA', 'MANA'], 0],
    // no MANA and less than 20% of MA (professor's rule RQ7)
    [['MPA', 'MPA', 'MPA', 'MPA', 'MPA', 'MPA'], 7],
    [['MPA', 'MPA', 'MPA', 'MPA', 'MPA', 'MA'], 7],
    // no MANA and at least 20% of MA: 7 + 3 x the share of MA
    [['MA', 'MA', 'MPA', 'MPA', 'MPA', 'MPA'], 8],
    [['MA', 'MA', 'MA', 'MA', 'MPA', 'MPA'], 9],
    [['MA', 'MA', 'MA', 'MA', 'MA', 'MA'], 10]
  ] as [EvaluationGrade[], number][])('in the concepts model, %j gives %s', (grades, expected) => {
    expect(concepts().calculateRoundedAverage(evaluationsOf(grades))).toBe(expected);
  });
});

describe('roundUpToOneDecimal', () => {
  test.each([
    [6.8333333, 6.9],
    [6.81, 6.9],
    [7, 7],
    [0, 0],
    [10, 10],
    // floating point noise around an exact value is not rounded up
    [6.9999999999, 7],
    [7.0000000001, 7],
    [0.1 + 0.2, 0.3]
  ])('rounds %s up to %s', (value, expected) => {
    expect(roundUpToOneDecimal(value)).toBe(expected);
  });
});
