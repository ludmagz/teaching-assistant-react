import { EVALUATION_GOALS, Evaluation, EvaluationGrade, Grade, isGrade, isNumericGrade } from './Evaluation';
import { DomainError } from './DomainError';

type Goal = string;

/**
 * The ways a class can compute its students' averages:
 * - simple: numeric grades from 0 to 10, every goal with the same weight;
 * - weighted: numeric grades from 0 to 10, goal weights that sum to 10;
 * - concepts: MA, MPA and MANA grades, no weights and no passing average.
 */
export const AVERAGE_CALCULATION_MODELS = ['simple', 'weighted', 'concepts'] as const;

export type AverageCalculationModel = typeof AVERAGE_CALCULATION_MODELS[number];

/** Type guard: tells whether an arbitrary value is one of the known models. */
export function isAverageCalculationModel(value: unknown): value is AverageCalculationModel {
    return (AVERAGE_CALCULATION_MODELS as readonly unknown[]).includes(value);
}

/** Whether a model takes numeric grades (and therefore a passing average). */
export function isNumericModel(model: AverageCalculationModel | null): boolean {
    return model === 'simple' || model === 'weighted';
}

/** Sum the goal weights must have in the weighted model. */
export const WEIGHTED_MODEL_WEIGHTS_SUM = 10;

/** The rules a professor chooses for a class. */
export interface AverageCalculationRules {
    model: AverageCalculationModel;
    minimumAverageToPass?: number | null;
    minimumAverageForFinalExam?: number | null;
}

/** The averages that classify a student, as consumed by the client. */
export interface GradingThresholds {
    minimumAverageToPass: number;
    minimumAverageForFinalExam: number;
}

/**
 * Specifies how a student's average is computed from the grades of the
 * learning goals: the model chosen for the class (none until the professor
 * defines one), the averages that classify students and the weight of each
 * goal. Each grade (MA, MPA, MANA) also keeps a number of points, read and
 * written for compatibility with the data files of previous versions.
 *
 * Instances are immutable.
 */
export class AverageCalculationSpecification {
    private readonly gradeWeights: Map<Grade, number>; // MA, MPA, MANA
    private readonly goalWeights: Map<Goal, number>; // "Configuration Management", "Project Management", etc.
    private readonly goalWeightsSum: number;
    private readonly model: AverageCalculationModel | null;
    private readonly minimumAverageToPass: number | null;
    private readonly minimumAverageForFinalExam: number | null;

    constructor(
        initialGradeWeights: Map<Grade, number>,
        initialGoalWeights: Map<Goal, number>,
        rules: AverageCalculationRules | null = null
    ) {
        // copies the maps, so that later changes to the arguments have no effect
        this.gradeWeights = new Map(initialGradeWeights);
        this.goalWeights = new Map(initialGoalWeights);

        // precomputes the sum of the goal weights (the denominator)
        this.goalWeightsSum = Array.from(initialGoalWeights).reduce((acc, v) => acc + v[1], 0);

        if (this.goalWeightsSum === 0)
            throw new DomainError("The sum of the goal weights cannot be zero.");

        this.model = rules?.model ?? null;
        // the concepts model has no numeric averages to compare with
        this.minimumAverageToPass = isNumericModel(this.model) ? rules?.minimumAverageToPass ?? null : null;
        this.minimumAverageForFinalExam = isNumericModel(this.model) ? rules?.minimumAverageForFinalExam ?? null : null;

        this.validateRules();
    }

    private validateRules(): void {
        if (this.model !== null && !isAverageCalculationModel(this.model))
            throw new DomainError('Unknown average calculation model');

        if (!isNumericModel(this.model))
            return;

        if (!isNumericGrade(this.minimumAverageToPass))
            throw new DomainError('The passing average must be between 0 and 10');

        if (this.minimumAverageForFinalExam === null)
            throw new DomainError('The minimum average for the final exam is required');

        if (!(isNumericGrade(this.minimumAverageForFinalExam)
            && this.minimumAverageForFinalExam <= this.minimumAverageToPass))
            throw new DomainError('The minimum average for the final exam must be between 0 and the passing average');

        // tolerance, since the weights may be decimals
        if (this.model === 'weighted' && Math.abs(this.goalWeightsSum - WEIGHTED_MODEL_WEIGHTS_SUM) > 1e-9)
            throw new DomainError(`The sum of the goal weights must be ${WEIGHTED_MODEL_WEIGHTS_SUM}`);
    }

    /**
     * Builds the specification of a model, with the weights it implies: the
     * given ones in the weighted model, the same weight for every goal in the
     * others.
     */
    static forModel(
        model: AverageCalculationModel,
        options: {
            minimumAverageToPass?: number | null;
            minimumAverageForFinalExam?: number | null;
            goalWeights?: Record<Goal, number>;
        } = {}
    ): AverageCalculationSpecification {
        let goalWeights = DEFAULT_GOAL_WEIGHTS;
        if (model === 'weighted') {
            const weights = options.goalWeights ?? {};
            if (!EVALUATION_GOALS.every(goal => typeof weights[goal] === 'number' && weights[goal] >= 0))
                throw new DomainError('A non-negative weight is required for every goal');
            goalWeights = new Map(EVALUATION_GOALS.map(goal => [goal, weights[goal]]));
        }
        return new AverageCalculationSpecification(DEFAULT_GRADE_WEIGHTS, goalWeights, {
            model,
            minimumAverageToPass: options.minimumAverageToPass,
            minimumAverageForFinalExam: options.minimumAverageForFinalExam
        });
    }

    getModel(): AverageCalculationModel | null {
        return this.model;
    }

    getMinimumAverageToPass(): number | null {
        return this.minimumAverageToPass;
    }

    getMinimumAverageForFinalExam(): number | null {
        return this.minimumAverageForFinalExam;
    }

    /**
     * The averages that classify a student as approved, at the final exam or
     * failed; null in the concepts model and in a class with no rules yet.
     */
    getGradingThresholds(): GradingThresholds | null {
        if (this.minimumAverageToPass === null || this.minimumAverageForFinalExam === null)
            return null;
        return {
            minimumAverageToPass: this.minimumAverageToPass,
            minimumAverageForFinalExam: this.minimumAverageForFinalExam
        };
    }

    /**
     * Computes the weighted average of the student's grades.
     * @param gradesByGoal the grade obtained for each goal.
     * @returns the weighted average.
    */
    calculateAverage(gradesByGoal: Map<Goal, Grade>): number 
    {
        let total = 0;

        for (const [goal, grade] of gradesByGoal.entries()) 
        {
            const gradeWeight = this.gradeWeights.get(grade)!;
            const goalWeight = this.goalWeights.get(goal)!;
            total += goalWeight * gradeWeight;
        }

        return total / this.goalWeightsSum;
    }

    /**
     * Computes a student's average according to the model of the class,
     * rounded up to one decimal place.
     * @param evaluations the grades the student obtained.
     * @returns the average, or null when the class has no model yet, when a
     * goal has no grade, or when a grade does not belong to the model.
     */
    calculateRoundedAverage(evaluations: Evaluation[]): number | null {
        if (this.model === null)
            return null;

        const gradesByGoal = new Map(evaluations.map(evaluation => [evaluation.getGoal(), evaluation.getGrade()]));
        const goals = Array.from(this.goalWeights.keys());

        // no average unless every evaluated goal has a grade
        if (!goals.every(goal => gradesByGoal.has(goal)))
            return null;

        const average = this.model === 'concepts'
            ? calculateConceptsAverage(goals.map(goal => gradesByGoal.get(goal)!))
            : this.calculateNumericAverage(goals, gradesByGoal);

        return average === null ? null : roundUpToOneDecimal(average);
    }

    /** Weighted mean of numeric grades; every weight is 1 in the simple model. */
    private calculateNumericAverage(goals: Goal[], gradesByGoal: Map<Goal, EvaluationGrade>): number | null {
        let total = 0;
        for (const goal of goals) {
            const grade = gradesByGoal.get(goal);
            if (typeof grade !== 'number')
                return null;
            total += this.goalWeights.get(goal)! * grade;
        }
        return total / this.goalWeightsSum;
    }

    // Exports the data in a serializable format
    toJSON() 
    {
        const mapToObject = <K>(map: Map<K, number>) =>
            Object.fromEntries(Array.from(map.entries()) as [any, number][]);

        return {
            gradeWeights: mapToObject(this.gradeWeights),
            goalWeights: mapToObject(this.goalWeights),
            // without a model the format is the one of previous versions
            ...(this.model === null ? {} : {
                model: this.model,
                minimumAverageToPass: this.minimumAverageToPass,
                minimumAverageForFinalExam: this.minimumAverageForFinalExam
            })
        };
    }

    /**
     * Rebuilds an instance from serialized data, accepting the key names and
     * the map encodings used by previous versions of the system, so that data
     * files and payloads written by them are not lost.
     *
     * Falls back to the default specification when the data carries no
     * weights at all. Data without a model (all of it, before models
     * existed) is read as a class with no rules defined.
     */
    static fromJSON(data: any): AverageCalculationSpecification {
        const normalize = (x: any): Map<string, number> => {
            if (!x) return new Map();
            // already an object { key: value, ... }
            if (!Array.isArray(x) && typeof x === 'object') {
            return new Map(Object.entries(x).map(([k, v]) => [k, Number(v)]));
            }
            // legacy formats: array of { key, value } or array of [key, value]
            if (Array.isArray(x)) {
            // array of objects {key, value}
            if (x.length > 0 && typeof x[0] === 'object' && 'key' in x[0]) {
                return new Map(x.map((entry: any) => [entry.key, Number(entry.value)]));
            }
            // array of pairs [key, value]
            return new Map(x.map((entry: any) => [entry[0], Number(entry[1])]));
            }
            // fallback
            return new Map();
        };

        // pesosDosConceitos and pesosDasMetas are the names used before the
        // identifiers of this class were translated to English
        const gradeWeights = normalize(data?.gradeWeights ?? data?.pesosDosConceitos);
        const goalWeights = normalize(data?.goalWeights ?? data?.pesosDasMetas);

        if (goalWeights.size === 0) {
            return DEFAULT_AVERAGE_CALCULATION_SPECIFICATION;
        }

        const rules: AverageCalculationRules | null = isAverageCalculationModel(data?.model)
            ? {
                model: data.model,
                minimumAverageToPass: data.minimumAverageToPass ?? null,
                minimumAverageForFinalExam: data.minimumAverageForFinalExam ?? null
            }
            : null;

        return new AverageCalculationSpecification(gradeWeights as Map<any, number>, goalWeights as Map<any, number>, rules);
    }

}


/**
 * Rounds a value up to one decimal place (6.83 becomes 6.9). The value is
 * first rounded to six decimal places of tenths, so that floating point
 * noise such as 6.9999999999 standing for 7 is not rounded up to 7.1.
 */
export function roundUpToOneDecimal(value: number): number {
    const tenths = Math.round(value * 10 * 1e6) / 1e6;
    return Math.ceil(tenths) / 10;
}

/** Average given to a student with some MANA and at least 60% of MA or MPA. */
const AVERAGE_WITH_MANA = 6.5;
/** Average given to a student with no MANA and less than 20% of MA. */
const AVERAGE_WITHOUT_MANA = 7;

/**
 * Average of a student graded with concepts, every goal counting the same:
 * - some MANA and at least 60% of MA or MPA: 6.5 (professor's rule RQ6);
 * - some MANA and less than 60% of MA or MPA: 10 x the share of MA or MPA;
 * - no MANA and less than 20% of MA: 7 (professor's rule RQ7);
 * - no MANA and at least 20% of MA: 7 + 3 x the share of MA.
 * The shares are compared through counts, so that no floating point
 * rounding decides on which side of a limit a student falls.
 * @returns the average, or null when a grade is not a concept.
 */
function calculateConceptsAverage(grades: EvaluationGrade[]): number | null {
    if (!grades.every(isGrade))
        return null;

    const total = grades.length;
    const ma = grades.filter(grade => grade === 'MA').length;
    const mana = grades.filter(grade => grade === 'MANA').length;
    const maOrMpa = total - mana;

    if (mana > 0)
        return maOrMpa * 10 >= total * 6 ? AVERAGE_WITH_MANA : 10 * maOrMpa / total;

    return ma * 5 < total ? AVERAGE_WITHOUT_MANA : AVERAGE_WITHOUT_MANA + 3 * ma / total;
}

const DEFAULT_GRADE_WEIGHTS = new Map<Grade, number>([
  ['MA', 10],
  ['MPA', 7],
  ['MANA', 0],
]);

// Every evaluation goal has the same weight by default
const DEFAULT_GOAL_WEIGHTS = new Map<Goal, number>(EVALUATION_GOALS.map(goal => [goal, 1]));

export const DEFAULT_AVERAGE_CALCULATION_SPECIFICATION = new AverageCalculationSpecification(
  DEFAULT_GRADE_WEIGHTS,
  DEFAULT_GOAL_WEIGHTS
);
