/** The grades a student can get for a learning goal, from worst to best. */
export const GRADES = ['MANA', 'MPA', 'MA'] as const;

export type Grade = typeof GRADES[number];

/** Bounds of a numeric grade, used by the numeric average models. */
export const MIN_NUMERIC_GRADE = 0;
export const MAX_NUMERIC_GRADE = 10;

/** What an evaluation can hold: a concept (MA, MPA, MANA) or a numeric grade. */
export type EvaluationGrade = Grade | number;

export interface Evaluation {
  goal: string;
  grade: EvaluationGrade;
}

/** The learning goals graded in every class (same list as the server's). */
export const EVALUATION_GOALS = [
  'Requirements',
  'Configuration Management', 
  'Project Management',
  'Design',
  'Tests',
  'Refactoring'
] as const;

export type EvaluationGoal = typeof EVALUATION_GOALS[number];