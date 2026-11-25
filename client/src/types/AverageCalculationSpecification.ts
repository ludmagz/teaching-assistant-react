import { Grade } from './Evaluation';

/**
 * The ways a class can compute its students' averages (same list as the
 * server's): numeric grades without or with goal weights, or concepts.
 */
export const AVERAGE_CALCULATION_MODELS = ['simple', 'weighted', 'concepts'] as const;

export type AverageCalculationModel = typeof AVERAGE_CALCULATION_MODELS[number];

/** Whether a model takes numeric grades (and therefore the grading averages). */
export const isNumericModel = (model: AverageCalculationModel | null | undefined): boolean =>
  model === 'simple' || model === 'weighted';

/** Sum the goal weights must have in the weighted model. */
export const WEIGHTED_MODEL_WEIGHTS_SUM = 10;

/**
 * How a class computes a student's average, as sent by the server: points
 * per grade and weight per learning goal (plain objects, since Maps do not
 * survive JSON). The model and the averages are absent while the class has
 * no rules defined.
 */
export interface AverageCalculationSpecification {
  gradeWeights: Record<Grade, number>;
  goalWeights: Record<string, number>;
  model?: AverageCalculationModel;
  minimumAverageToPass?: number | null;
  minimumAverageForFinalExam?: number | null;
}

/** Fields a client sends to define the average calculation rules of a class. */
export interface DefineAverageCalculationSpecificationRequest {
  model: AverageCalculationModel;
  minimumAverageToPass?: number;
  minimumAverageForFinalExam?: number;
  goalWeights?: Record<string, number>;
}
