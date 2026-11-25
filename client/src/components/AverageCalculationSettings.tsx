import React, { useEffect, useState } from 'react';
import { Class } from '../types/Class';
import { EVALUATION_GOALS } from '../types/Evaluation';
import {
  AverageCalculationModel,
  AverageCalculationSpecification,
  DefineAverageCalculationSpecificationRequest,
  isNumericModel,
  WEIGHTED_MODEL_WEIGHTS_SUM
} from '../types/AverageCalculationSpecification';
import { classService } from '../services/ClassService';

interface AverageCalculationSettingsProps {
  classObj: Class;                         // Class whose average calculation is configured
  onSaved: (updatedClass: Class) => void;  // Callback with the class answered by the server
}

/** Labels of the models, in the order they are offered. */
export const MODEL_LABELS: Record<AverageCalculationModel, string> = {
  simple: 'Numeric 0 to 10 without weights',
  weighted: 'Numeric 0 to 10 with weights',
  concepts: 'Concepts (MA, MPA, MANA)'
};

interface FormState {
  model: AverageCalculationModel | '';
  passingAverage: string;
  finalExamAverage: string;
  weights: string[];                       // one per goal, in the order of EVALUATION_GOALS
}

const formFor = (specification: AverageCalculationSpecification): FormState => ({
  model: specification.model ?? '',
  passingAverage: specification.minimumAverageToPass?.toString() ?? '',
  finalExamAverage: specification.minimumAverageForFinalExam?.toString() ?? '',
  weights: EVALUATION_GOALS.map(goal =>
    specification.model === 'weighted' ? String(specification.goalWeights[goal] ?? '') : '1')
});

/**
 * Reads a number typed by the user, accepting a decimal comma (7,5);
 * an empty field is not informed, rather than 0.
 */
const numberTyped = (value: string): number | undefined =>
  value.trim() === '' ? undefined : Number(value.replace(',', '.'));

/**
 * Form to define how the averages of a class are computed: the model and,
 * in the numeric ones, the passing average, the minimum average for the
 * final exam and (with weights) the weight of each goal. The rules are
 * checked by the server, whose messages are shown here.
 */
const AverageCalculationSettings: React.FC<AverageCalculationSettingsProps> = ({ classObj, onSaved }) => {
  const specification = classObj.averageCalculationSpecification;
  const [form, setForm] = useState<FormState>(() => formFor(specification));
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Reset the form only when another class is selected or its saved rules change,
  // so that reloading the class after a grade is recorded keeps what is being typed
  const savedRules = JSON.stringify(specification);
  useEffect(() => {
    setForm(formFor(JSON.parse(savedRules)));
  }, [classObj.id, savedRules]);

  const changeField = (changes: Partial<FormState>) => {
    setForm(previous => ({ ...previous, ...changes }));
    setSuccessMessage('');
    setErrorMessage('');
  };

  const changeWeight = (index: number, value: string) =>
    changeField({ weights: form.weights.map((weight, i) => (i === index ? value : weight)) });

  const weightsSum = form.weights.reduce((sum, weight) => sum + (numberTyped(weight) ?? 0), 0);

  const requestFor = (model: AverageCalculationModel): DefineAverageCalculationSpecificationRequest => {
    if (!isNumericModel(model)) {
      return { model };
    }
    return {
      model,
      minimumAverageToPass: numberTyped(form.passingAverage),
      minimumAverageForFinalExam: numberTyped(form.finalExamAverage),
      ...(model === 'weighted' && {
        goalWeights: Object.fromEntries(EVALUATION_GOALS.map((goal, i) => [goal, numberTyped(form.weights[i]) as number]))
      })
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.model === '') {
      setErrorMessage('Select an average calculation model');
      return;
    }
    setIsSaving(true);
    try {
      const updatedClass = await classService.defineAverageCalculationSpecification(classObj.id, requestFor(form.model));
      setSuccessMessage('Average calculation saved.');
      setErrorMessage('');
      onSaved(updatedClass);
    } catch (error) {
      setSuccessMessage('');
      setErrorMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="average-calculation-settings" onSubmit={handleSubmit} data-testid="average-calculation-settings">
      <h4>Average calculation</h4>

      {!specification.model && (
        <p className="average-calculation-notice">Define the average calculation model before recording grades.</p>
      )}

      <div className="form-group">
        <label htmlFor="averageType">Model:</label>
        <select
          id="averageType"
          value={form.model}
          onChange={(e) => changeField({ model: e.target.value as AverageCalculationModel | '' })}
          disabled={isSaving}
        >
          <option value="">-- Select a model --</option>
          {(Object.keys(MODEL_LABELS) as AverageCalculationModel[]).map(model => (
            <option key={model} value={model}>{MODEL_LABELS[model]}</option>
          ))}
        </select>
      </div>

      {isNumericModel(form.model || null) && (
        <div className="form-row average-calculation-averages">
          <div className="form-group">
            <label htmlFor="passingAverage">Passing average:</label>
            <input
              id="passingAverage"
              type="text"
              inputMode="decimal"
              value={form.passingAverage}
              onChange={(e) => changeField({ passingAverage: e.target.value })}
              placeholder="e.g., 7.0"
              disabled={isSaving}
            />
          </div>
          <div className="form-group">
            <label htmlFor="finalExamAverage">Minimum average for the final exam:</label>
            <input
              id="finalExamAverage"
              type="text"
              inputMode="decimal"
              value={form.finalExamAverage}
              onChange={(e) => changeField({ finalExamAverage: e.target.value })}
              placeholder="e.g., 3.0"
              disabled={isSaving}
            />
          </div>
        </div>
      )}

      {form.model === 'weighted' && (
        <fieldset className="average-calculation-weights">
          <legend>
            Goal weights (sum must be {WEIGHTED_MODEL_WEIGHTS_SUM}, current: <span data-testid="weights-sum">{weightsSum}</span>)
          </legend>
          {EVALUATION_GOALS.map((goal, index) => (
            <div className="form-group" key={goal}>
              <label htmlFor={`goalWeight-${index}`}>{goal}</label>
              <input
                id={`goalWeight-${index}`}
                type="text"
                inputMode="decimal"
                value={form.weights[index]}
                onChange={(e) => changeWeight(index, e.target.value)}
                disabled={isSaving}
              />
            </div>
          ))}
        </fieldset>
      )}

      <div className="form-buttons">
        <button type="submit" className="submit-btn" disabled={isSaving} data-testid="save-average-calculation">
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {successMessage && <div className="success-message" role="status">{successMessage}</div>}
      {errorMessage && <div className="error-message" role="alert">{errorMessage}</div>}
    </form>
  );
};

export default AverageCalculationSettings;
