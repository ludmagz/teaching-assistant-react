import { Student } from './Student';
import { Evaluation } from './Evaluation';

export interface Enrollment {
  student: Student;
  evaluations: Evaluation[];
  averageBeforeFinalExam?: number | null;
  averageAfterFinalExam?: number;
  failedByAbsence?: boolean;
  relativePerformance?: 'BELOW_AVERAGE' | 'AT_AVERAGE' | 'ABOVE_AVERAGE' | null;
  priorFailureCount?: number | null;
}

export interface CreateEnrollmentRequest {
  studentCPF: string;
  evaluations?: Evaluation[];
  averageBeforeFinalExam?: number;
  averageAfterFinalExam?: number;
  failedByAbsence?: boolean;
}

export interface UpdateEnrollmentRequest {
  evaluations?: Evaluation[];
  averageBeforeFinalExam?: number;
  averageAfterFinalExam?: number;
  failedByAbsence?: boolean;
}
