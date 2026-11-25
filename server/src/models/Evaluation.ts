/** The grades a student can get for a learning goal, from worst to best. */
export const GRADES = ['MANA', 'MPA', 'MA'] as const;

export type Grade = typeof GRADES[number];

/** Type guard: tells whether an arbitrary value is one of the known grades. */
export function isGrade(value: unknown): value is Grade {
  return (GRADES as readonly unknown[]).includes(value);
}

/** Bounds of a numeric grade, used by the numeric average models. */
export const MIN_NUMERIC_GRADE = 0;
export const MAX_NUMERIC_GRADE = 10;

/** Type guard: tells whether an arbitrary value is a number from 0 to 10. */
export function isNumericGrade(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= MIN_NUMERIC_GRADE
    && value <= MAX_NUMERIC_GRADE;
}

/** What an evaluation can hold: a concept (MA, MPA, MANA) or a numeric grade. */
export type EvaluationGrade = Grade | number;

/** Type guard: tells whether an arbitrary value is a concept or a numeric grade. */
export function isEvaluationGrade(value: unknown): value is EvaluationGrade {
  return isGrade(value) || isNumericGrade(value);
}

/** The grade a student got for one learning goal of a class. */
export class Evaluation {
  private goal: string;
  private grade: EvaluationGrade;

  constructor(goal: string, grade: EvaluationGrade) {
    this.goal = goal;
    this.grade = grade;
  }

  public getGoal(): string {
    return this.goal;
  }

  public getGrade(): EvaluationGrade {
    return this.grade;
  }

  public setGrade(grade: EvaluationGrade): void {
    this.grade = grade;
  }

  public toJSON() {
    return {
      goal: this.goal,
      grade: this.grade
    };
  }

  // Create Evaluation from JSON object
  public static fromJSON(data: { goal: string; grade: EvaluationGrade }): Evaluation {
    return new Evaluation(data.goal, data.grade);
  }
}

/** The learning goals graded in every class. */
export const EVALUATION_GOALS = [
  'Requirements',
  'Configuration Management', 
  'Project Management',
  'Design',
  'Tests',
  'Refactoring'
] as const;