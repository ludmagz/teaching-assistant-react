import { Enrollment } from '../types/Enrollment';
import { EvaluationGrade } from '../types/Evaluation';
import { get, remove, sendJson } from './apiClient';
import { classPath } from './ClassService';

/** Access to the enrollments of a class and to the students' evaluations. */
export const enrollmentService = {
  enrollStudent: (classId: string, studentCPF: string): Promise<Enrollment> =>
    sendJson('POST', `${classPath(classId)}/enroll`, { studentCPF }, 'Failed to enroll student'),

  unenrollStudent: (classId: string, studentCPF: string): Promise<void> =>
    remove(`${classPath(classId)}/enroll/${studentCPF}`, 'Failed to unenroll student'),

  getClassEnrollments: (classId: string): Promise<Enrollment[]> =>
    get(`${classPath(classId)}/enrollments`, 'Failed to fetch enrollments'),

  /** Sets the grade of a goal (a concept or a number); an empty grade removes the evaluation. */
  updateEvaluation: (classId: string, studentCPF: string, goal: string, grade: EvaluationGrade | ''): Promise<Enrollment> =>
    sendJson('PUT', `${classPath(classId)}/enrollments/${studentCPF}/evaluation`, { goal, grade }, 'Failed to update evaluation')
};
