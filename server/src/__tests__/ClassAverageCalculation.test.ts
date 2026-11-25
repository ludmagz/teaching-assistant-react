import { Class } from '../models/Class';
import { Student } from '../models/Student';
import {
  AverageCalculationSpecification,
  DEFAULT_AVERAGE_CALCULATION_SPECIFICATION
} from '../models/AverageCalculationSpecification';
import { EVALUATION_GOALS } from '../models/Evaluation';

/**
 * Class (unit) tests for the rules a class applies to its average
 * calculation specification and to the grades recorded in it.
 */

const ana = () => new Student('Ana Lima', '123.456.789-01', 'ana@cin.ufpe.br');

const simple = (minimumAverageToPass = 7) =>
  AverageCalculationSpecification.forModel('simple', { minimumAverageToPass, minimumAverageForFinalExam: 3 });
const weighted = () => AverageCalculationSpecification.forModel('weighted', {
  minimumAverageToPass: 7,
  minimumAverageForFinalExam: 3,
  goalWeights: Object.fromEntries(EVALUATION_GOALS.map((goal, index) => [goal, index === 5 ? 5 : 1]))
});
const concepts = () => AverageCalculationSpecification.forModel('concepts');

/** A class with the given specification and Ana enrolled, optionally with a grade in Requirements. */
const classWith = (specification: AverageCalculationSpecification, grade?: 'MA' | number): Class => {
  const classObj = new Class('Software Engineering', 1, 2025, specification);
  const enrollment = classObj.addEnrollment(ana());
  if (grade !== undefined) enrollment.addOrUpdateEvaluation('Requirements', grade);
  return classObj;
};

describe('Class average calculation specification', () => {
  test('a class with no grades can switch to any model', () => {
    const classObj = classWith(concepts());
    classObj.setAverageCalculationSpecification(simple());
    expect(classObj.getAverageCalculationSpecification().getModel()).toBe('simple');
    classObj.setAverageCalculationSpecification(concepts());
    expect(classObj.getAverageCalculationSpecification().getModel()).toBe('concepts');
  });

  test('a class with grades cannot switch between concepts and a numeric model', () => {
    const classObj = classWith(concepts(), 'MA');
    expect(() => classObj.setAverageCalculationSpecification(simple()))
      .toThrow('The model cannot be changed in a class that already has grades');
    expect(classObj.getAverageCalculationSpecification().getModel()).toBe('concepts');
  });

  test('a class with grades can switch between the numeric models', () => {
    const classObj = classWith(weighted(), 8);
    classObj.setAverageCalculationSpecification(simple());
    expect(classObj.getAverageCalculationSpecification().getModel()).toBe('simple');
    classObj.setAverageCalculationSpecification(weighted());
    expect(classObj.getAverageCalculationSpecification().getModel()).toBe('weighted');
  });

  test('a class with grades can change its averages, keeping the model', () => {
    const classObj = classWith(simple(7), 8);
    classObj.setAverageCalculationSpecification(simple(6));
    expect(classObj.getAverageCalculationSpecification().getMinimumAverageToPass()).toBe(6);
  });

  test('a class with no model but with grades can only get a model that matches them', () => {
    const classObj = classWith(DEFAULT_AVERAGE_CALCULATION_SPECIFICATION, 'MA');
    expect(() => classObj.setAverageCalculationSpecification(simple()))
      .toThrow('The model is not compatible with the grades already recorded in the class');
    expect(classObj.getAverageCalculationSpecification().getModel()).toBeNull();
    classObj.setAverageCalculationSpecification(concepts());
    expect(classObj.getAverageCalculationSpecification().getModel()).toBe('concepts');
  });

  test('a class that had its grades removed can switch to any model', () => {
    const classObj = classWith(concepts(), 'MA');
    classObj.getEnrollments()[0].removeEvaluation('Requirements');
    expect(classObj.hasGrades()).toBe(false);
    classObj.setAverageCalculationSpecification(simple());
    expect(classObj.getAverageCalculationSpecification().getModel()).toBe('simple');
  });

  test('serializes the grading thresholds of a numeric model', () => {
    expect(classWith(simple()).toJSON().gradingThresholds).toEqual({ minimumAverageToPass: 7, minimumAverageForFinalExam: 3 });
    expect(classWith(concepts()).toJSON().gradingThresholds).toBeNull();
  });
});

describe('Class grade recording', () => {
  test('rejects any grade while the class has no model', () => {
    const classObj = classWith(DEFAULT_AVERAGE_CALCULATION_SPECIFICATION);
    for (const grade of ['MA', 8] as const) {
      expect(() => classObj.checkGradeCanBeRecorded(grade))
        .toThrow('The average calculation model of the class must be defined before grades are recorded');
    }
  });

  test('accepts only concepts in the concepts model', () => {
    const classObj = classWith(concepts());
    expect(() => classObj.checkGradeCanBeRecorded('MA')).not.toThrow();
    expect(() => classObj.checkGradeCanBeRecorded(8))
      .toThrow('The grade does not match the average calculation model of the class');
  });

  test.each([['simple', simple], ['weighted', weighted]])('accepts only numbers in the %s model', (_model, build) => {
    const classObj = classWith(build());
    expect(() => classObj.checkGradeCanBeRecorded(0)).not.toThrow();
    expect(() => classObj.checkGradeCanBeRecorded('MA'))
      .toThrow('The grade does not match the average calculation model of the class');
  });

  test('tells whether any student has a grade', () => {
    expect(classWith(simple()).hasGrades()).toBe(false);
    expect(classWith(simple(), 8).hasGrades()).toBe(true);
  });
});
