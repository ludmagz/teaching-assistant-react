import { Student } from './Student';
import { Enrollment } from './Enrollment';
import { AverageCalculationSpecification, AverageCalculationModel, isNumericModel } from './AverageCalculationSpecification';
import { EvaluationGrade, isGrade } from './Evaluation';
import { DomainError } from './DomainError';

/**
 * A class (offering of a course) given in a semester of a year, identified by
 * 'topic-year-semester', with the enrolled students and the specification
 * of how their averages are computed. A student is enrolled at most once.
 */
export class Class {
  private topic: string;
  private semester: number;
  private year: number;
  private averageCalculationSpecification: AverageCalculationSpecification;
  private enrollments: Enrollment[];

  constructor(topic: string, semester: number, year: number, averageCalculationSpecification: AverageCalculationSpecification, enrollments: Enrollment[] = []) {
    this.topic = topic;
    this.semester = semester;
    this.year = year;
    this.averageCalculationSpecification = averageCalculationSpecification;
    this.enrollments = enrollments;
  }

  // Getters
  getTopic(): string {
    return this.topic;
  }

  getSemester(): number {
    return this.semester;
  }

  getYear(): number {
    return this.year;
  }

  getEnrollments(): Enrollment[] {
    return [...this.enrollments]; // Return copy to prevent external modification
  }

  // Generate unique class ID
  getClassId(): string {
    return `${this.topic}-${this.year}-${this.semester}`;
  }

  // Setters for editing
  setTopic(topic: string): void {
    this.topic = topic;
  }

  setSemester(semester: number): void {
    this.semester = semester;
  }

  setYear(year: number): void {
    this.year = year;
  }

  getAverageCalculationSpecification(): AverageCalculationSpecification {
    return this.averageCalculationSpecification;
  }

  /**
   * Replaces the specification of how averages are computed. Once the class
   * has grades, the model can only change between the numeric ones (with
   * and without weights), and a class that had no model can only get one
   * that matches the grades already recorded; the averages can always change.
   */
  setAverageCalculationSpecification(specification: AverageCalculationSpecification): void {
    const currentModel = this.averageCalculationSpecification.getModel();
    const newModel = specification.getModel();

    if (this.hasGrades() && currentModel !== newModel) {
      if (currentModel === null) {
        if (!this.gradesMatchModel(newModel))
          throw new DomainError('The model is not compatible with the grades already recorded in the class');
      } else if (!(isNumericModel(currentModel) && isNumericModel(newModel))) {
        throw new DomainError('The model cannot be changed in a class that already has grades');
      }
    }

    this.averageCalculationSpecification = specification;
  }

  /**
   * Checks that a grade can be recorded in the class: the class must have a
   * model, and the grade must be of the kind the model takes.
   */
  checkGradeCanBeRecorded(grade: EvaluationGrade): void {
    const model = this.averageCalculationSpecification.getModel();
    if (model === null)
      throw new DomainError('The average calculation model of the class must be defined before grades are recorded');
    if (!gradeMatchesModel(grade, model))
      throw new DomainError('The grade does not match the average calculation model of the class');
  }

  /** Whether any enrolled student has a grade for some goal. */
  hasGrades(): boolean {
    return this.enrollments.some(enrollment => enrollment.getEvaluations().length > 0);
  }

  private gradesMatchModel(model: AverageCalculationModel | null): boolean {
    return model !== null && this.enrollments.every(enrollment =>
      enrollment.getEvaluations().every(evaluation => gradeMatchesModel(evaluation.getGrade(), model)));
  }

  // Enrollment management
  addEnrollment(student: Student): Enrollment {
    // Check if student is already enrolled
    const existingEnrollment = this.findEnrollmentByStudentCPF(student.getCPF());
    if (existingEnrollment) {
      throw new DomainError('Student is already enrolled in this class');
    }

    const enrollment = new Enrollment(student);
    this.enrollments.push(enrollment);
    return enrollment;
  }

  removeEnrollment(studentCPF: string): boolean {
    const index = this.enrollments.findIndex(enrollment => 
      enrollment.getStudent().getCPF() === studentCPF
    );
    
    if (index === -1) {
      return false;
    }

    this.enrollments.splice(index, 1);
    return true;
  }

  findEnrollmentByStudentCPF(studentCPF: string): Enrollment | undefined {
    return this.enrollments.find(enrollment => 
      enrollment.getStudent().getCPF() === studentCPF
    );
  }

  // Get all enrolled students
  getEnrolledStudents(): Student[] {
    return this.enrollments.map(enrollment => enrollment.getStudent());
  }

  // Convert to JSON for API responses
  toJSON() {
    return {
      id: this.getClassId(),
      topic: this.topic,
      semester: this.semester,
      year: this.year,
      averageCalculationSpecification: this.averageCalculationSpecification.toJSON(),
      gradingThresholds: this.averageCalculationSpecification.getGradingThresholds(),
      enrollments: this.enrollments.map(enrollment => enrollment.toJSON())
    };
  }

  // Create Class from JSON object
  static fromJSON(data: { topic: string; semester: number; year: number; averageCalculationSpecification: any, enrollments: any[] }, allStudents: Student[]): Class {
    const enrollments = data.enrollments
      ? data.enrollments.map((enrollmentData: any) => {
          const student = allStudents.find(s => s.getCPF() === enrollmentData.student.cpf);
          if (!student) {
            throw new DomainError(`Student with CPF ${enrollmentData.student.cpf} not found`);
          }
          return Enrollment.fromJSON(enrollmentData, student);
        })
      : [];
    
    // Rebuilds the average calculation specification
    const averageCalculationSpecification = AverageCalculationSpecification.fromJSON(data.averageCalculationSpecification);

    return new Class(data.topic, data.semester, data.year, averageCalculationSpecification, enrollments);
  }
}

/** Concepts in the concepts model, numbers in the numeric ones. */
function gradeMatchesModel(grade: EvaluationGrade, model: AverageCalculationModel): boolean {
  return isNumericModel(model) ? typeof grade === 'number' : isGrade(grade);
}
