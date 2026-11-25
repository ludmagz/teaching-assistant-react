import React, { useState, useEffect, useCallback } from 'react';
import { Class } from '../types/Class';
import { EVALUATION_GOALS, EvaluationGrade, GRADES } from '../types/Evaluation';
import { isNumericModel } from '../types/AverageCalculationSpecification';
import { classService } from '../services/ClassService';
import { enrollmentService } from '../services/EnrollmentService';
import { getAverageStatus } from '../utils/getAverageStatus';

import { ImportGradeComponent } from './ImportGrade';
import AverageCalculationSettings from './AverageCalculationSettings';
import NumericGradeInput from './NumericGradeInput';

const performanceLabels = {
  BELOW_AVERAGE: 'Below average',
  AT_AVERAGE: 'At average',
  ABOVE_AVERAGE: 'Above average',
};

interface EvaluationsProps {
  onError: (errorMessage: string) => void;
}

const Evaluations: React.FC<EvaluationsProps> = ({ onError }) => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    // Load previously selected class from localStorage
    return localStorage.getItem('evaluations-selected-class') || '';
  });
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Outcome of the last grade change, shown next to the table; a new one replaces it
  const [gradeFeedback, setGradeFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadClasses = useCallback(async () => {
    try {
      setIsLoading(true);
      const classesData = await classService.getAllClasses();
      setClasses(classesData);
    } catch (error) {
      onError(`Failed to load classes: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  // Reloads the classes keeping the page on screen (no loading state), so that
  // fields keep their focus and messages stay visible
  const refreshClasses = async () => {
    try {
      setClasses(await classService.getAllClasses());
    } catch (error) {
      onError(`Failed to load classes: ${(error as Error).message}`);
    }
  };

  // Load all classes on component mount
  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Update selected class when selectedClassId changes
  useEffect(() => {
    if (selectedClassId) {
      const classObj = classes.find(c => c.id === selectedClassId);
      setSelectedClass(classObj || null);
    } else {
      setSelectedClass(null);
    }
  }, [selectedClassId, classes]);

  const handleClassSelection = (classId: string) => {
    setSelectedClassId(classId);
    setGradeFeedback(null);
    // Save selected class to localStorage for persistence
    if (classId) {
      localStorage.setItem('evaluations-selected-class', classId);
    } else {
      localStorage.removeItem('evaluations-selected-class');
    }
  };

  /** Sends a grade change; resolves to whether the server accepted it. */
  const handleEvaluationChange = async (studentCPF: string, goal: string, grade: EvaluationGrade | ''): Promise<boolean> => {
    if (!selectedClass) {
      onError('No class selected');
      return false;
    }

    setGradeFeedback(null);
    try {
      await enrollmentService.updateEvaluation(selectedClass.id, studentCPF, goal, grade);
      const studentName = selectedClass.enrollments.find(e => e.student.cpf === studentCPF)?.student.name;
      setGradeFeedback({ kind: 'success', text: `The grade of ${studentName} was updated successfully.` });
      // Reload classes to get updated enrollment data
      await refreshClasses();
      return true;
    } catch (error) {
      setGradeFeedback({ kind: 'error', text: `Failed to update evaluation: ${(error as Error).message}` });
      // Show the stored grades again in place of the rejected one
      await refreshClasses();
      return false;
    }
  };

  if (isLoading) {
    return (
      <div className="evaluation-section">
        <h3>Evaluations</h3>
        <div className="evaluation-loading">
          Loading classes...
        </div>
      </div>
    );
  }

  return (
    <div className="evaluation-section">
      <h3>Evaluations</h3>
      
      {/* Class Selection */}
      <div className="class-selection-container">
        <label htmlFor="classSelect">Select Class:</label>
        <select
          id="classSelect"
          value={selectedClassId}
          onChange={(e) => handleClassSelection(e.target.value)}
          className="class-select"
        >
          <option value="">-- Select a class --</option>
          {classes.map((classObj) => (
            <option key={classObj.id} value={classObj.id}>
              {classObj.topic} ({classObj.year}/{classObj.semester})
            </option>
          ))}
        </select>
      </div>

      {selectedClass && (
        <AverageCalculationSettings classObj={selectedClass} onSaved={refreshClasses} />
      )}

      {!selectedClass && (
        <div className="evaluation-placeholder">
          <h4>No Class Selected</h4>
          <p>Please select a class to view and manage evaluations.</p>
        </div>
      )}

      {selectedClass && selectedClass.enrollments.length === 0 && (
        <div className="evaluation-placeholder">
          <h4>No Students Enrolled</h4>
          <p>This class has no enrolled students yet.</p>
          <p>Add students in the Students tab first.</p>
        </div>
      )}

      {selectedClass && selectedClass.enrollments.length > 0 && (
        <div className="evaluation-table-container">
          {/*Componente de importacao de notas de uma planilha, vai reagir as mudacas do classId */}
          <div>
            <ImportGradeComponent classID={selectedClassId} />
          </div>
          <h4>{selectedClass.topic} ({selectedClass.year}/{selectedClass.semester})</h4>
          {gradeFeedback && (
            <div
              className={gradeFeedback.kind === 'success' ? 'success-message' : 'error-message'}
              role={gradeFeedback.kind === 'success' ? 'status' : 'alert'}
              data-testid="grade-feedback"
            >
              {gradeFeedback.text}
            </div>
          )}

          <div className="evaluation-matrix">
            <table className="evaluation-table">
              <thead>
                <tr>
                  <th className="student-name-header">Student</th>
                  {EVALUATION_GOALS.map(goal => (
                    <th key={goal} className="goal-header">{goal}</th>
                  ))}
                  <th className="goal-header">AVERAGE</th>
                  <th scope="col" className="goal-header evaluation-indicator-header">
                    Performance vs. class
                  </th>
                  <th scope="col" className="goal-header evaluation-indicator-header">
                    Prior failures
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedClass.enrollments.map(enrollment => {
                  const student = enrollment.student;
                  const averageStatus = getAverageStatus(
                    enrollment.averageBeforeFinalExam,
                    selectedClass.gradingThresholds
                  );
                  
                  // Create a map of evaluations for quick lookup
                  const studentEvaluations = enrollment.evaluations.reduce((acc, evaluation) => {
                    acc[evaluation.goal] = evaluation.grade;
                    return acc;
                  }, {} as {[goal: string]: EvaluationGrade | undefined});
                  const model = selectedClass.averageCalculationSpecification.model;

                  return (
                    <tr key={student.cpf} className="student-row">
                      <td className="student-name-cell">{student.name}</td>
                      {EVALUATION_GOALS.map(goal => {
                        // ?? rather than ||, so that a grade 0 is not taken for no grade
                        const currentGrade = studentEvaluations[goal] ?? '';

                        if (isNumericModel(model)) {
                          return (
                            <td key={goal} className="evaluation-cell">
                              <NumericGradeInput
                                grade={typeof currentGrade === 'number' ? currentGrade : undefined}
                                label={`${student.name} — ${goal}`}
                                onCommit={(grade) => handleEvaluationChange(student.cpf, goal, grade)}
                                onInvalid={(text) => setGradeFeedback({ kind: 'error', text })}
                              />
                            </td>
                          );
                        }

                        // With no model, a grade can only be removed: the only options are '-' and the stored one
                        const options = model ? GRADES : (currentGrade === '' ? [] : [String(currentGrade)]);
                        return (
                          <td key={goal} className="evaluation-cell">
                            <select
                              value={currentGrade}
                              aria-label={`${student.name} — ${goal}`}
                              onChange={(e) => handleEvaluationChange(student.cpf, goal, e.target.value as EvaluationGrade | '')}
                              className={`evaluation-select ${currentGrade !== '' ? `grade-${String(currentGrade).toLowerCase()}` : ''}`}
                              disabled={!model && currentGrade === ''}
                            >
                              <option value="">-</option>
                              {options.map(grade => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                      <td
                        className={`evaluation-cell average-cell${averageStatus ? ` average-${averageStatus}` : ''}`}
                        data-testid="numeric-average"
                      >
                        {enrollment.averageBeforeFinalExam ?? '-'}
                      </td>
                      <td className="evaluation-cell">
                        {enrollment.relativePerformance
                          ? performanceLabels[enrollment.relativePerformance]
                          : 'Unavailable'}
                      </td>
                      <td className="evaluation-cell">
                        {enrollment.priorFailureCount ?? 'Unavailable'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className="average-legend"
            role="group"
            aria-label="Average field color legend"
            data-testid="average-legend"
          >
            <strong>Average field color legend:</strong>
            <span className="average-approved">Aprovado</span>
            <span className="average-final">Final</span>
            <span className="average-failed">Reprovado</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Evaluations;
