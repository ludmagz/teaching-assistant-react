import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AverageCalculationSettings from '../components/AverageCalculationSettings';
import { classService } from '../services/ClassService';
import { softwareEngineering } from '../test-support/fixtures';
import { Class } from '../types/Class';
import { AverageCalculationSpecification } from '../types/AverageCalculationSpecification';

jest.mock('../services/ClassService', () => ({ classService: { defineAverageCalculationSpecification: jest.fn() } }));

const GOALS = ['Requirements', 'Configuration Management', 'Project Management', 'Design', 'Tests', 'Refactoring'];

const classWith = (specification: Partial<AverageCalculationSpecification>): Class => ({
  ...softwareEngineering,
  averageCalculationSpecification: { gradeWeights: { MA: 10, MPA: 7, MANA: 0 }, goalWeights: {}, ...specification }
});

const define = classService.defineAverageCalculationSpecification as jest.Mock;

describe('AverageCalculationSettings', () => {
  beforeEach(() => jest.clearAllMocks());

  test('asks for a model while the class has none', () => {
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={jest.fn()} />);
    expect(screen.getByText('Define the average calculation model before recording grades.')).toBeInTheDocument();
    expect(screen.getByLabelText('Model:')).toHaveValue('');
    expect(screen.queryByLabelText('Passing average:')).not.toBeInTheDocument();
  });

  test('offers the three models', () => {
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={jest.fn()} />);
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      '-- Select a model --', 'Numeric 0 to 10 without weights', 'Numeric 0 to 10 with weights', 'Concepts (MA, MPA, MANA)'
    ]);
  });

  test('shows the saved rules of the class', () => {
    render(<AverageCalculationSettings
      classObj={classWith({ model: 'simple', minimumAverageToPass: 7, minimumAverageForFinalExam: 3 })} onSaved={jest.fn()} />);
    expect(screen.getByLabelText('Model:')).toHaveValue('simple');
    expect(screen.getByLabelText('Passing average:')).toHaveValue('7');
    expect(screen.getByLabelText('Minimum average for the final exam:')).toHaveValue('3');
    expect(screen.queryByText('Define the average calculation model before recording grades.')).not.toBeInTheDocument();
  });

  test('hides the averages and the weights in the concepts model', async () => {
    const user = userEvent.setup();
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={jest.fn()} />);
    await user.selectOptions(screen.getByLabelText('Model:'), 'concepts');
    expect(screen.queryByLabelText('Passing average:')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Minimum average for the final exam:')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Requirements')).not.toBeInTheDocument();
  });

  test('saves the simple model, accepting a decimal comma, and confirms it', async () => {
    const user = userEvent.setup();
    const updated = classWith({ model: 'simple', minimumAverageToPass: 7, minimumAverageForFinalExam: 3 });
    define.mockResolvedValue(updated);
    const onSaved = jest.fn();
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={onSaved} />);
    await user.selectOptions(screen.getByLabelText('Model:'), 'simple');
    await user.type(screen.getByLabelText('Passing average:'), '7,0');
    await user.type(screen.getByLabelText('Minimum average for the final exam:'), '3');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(define).toHaveBeenCalledWith(softwareEngineering.id,
      { model: 'simple', minimumAverageToPass: 7, minimumAverageForFinalExam: 3 });
    expect(await screen.findByRole('status')).toHaveTextContent('Average calculation saved.');
    expect(onSaved).toHaveBeenCalledWith(updated);
  });

  test('saves the weighted model with one weight per goal, showing their sum', async () => {
    const user = userEvent.setup();
    define.mockResolvedValue(softwareEngineering);
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={jest.fn()} />);
    await user.selectOptions(screen.getByLabelText('Model:'), 'weighted');
    await user.type(screen.getByLabelText('Passing average:'), '7');
    await user.type(screen.getByLabelText('Minimum average for the final exam:'), '3');
    expect(screen.getByTestId('weights-sum')).toHaveTextContent('6');
    const refactoring = screen.getByLabelText('Refactoring');
    await user.clear(refactoring);
    await user.type(refactoring, '5');
    expect(screen.getByTestId('weights-sum')).toHaveTextContent('10');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(define).toHaveBeenCalledWith(softwareEngineering.id, {
      model: 'weighted', minimumAverageToPass: 7, minimumAverageForFinalExam: 3,
      goalWeights: Object.fromEntries(GOALS.map(goal => [goal, goal === 'Refactoring' ? 5 : 1]))
    });
  });

  test('saves the concepts model with no averages', async () => {
    const user = userEvent.setup();
    define.mockResolvedValue(softwareEngineering);
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={jest.fn()} />);
    await user.selectOptions(screen.getByLabelText('Model:'), 'concepts');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(define).toHaveBeenCalledWith(softwareEngineering.id, { model: 'concepts' });
  });

  test('sends an empty average as not informed, rather than 0', async () => {
    const user = userEvent.setup();
    define.mockResolvedValue(softwareEngineering);
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={jest.fn()} />);
    await user.selectOptions(screen.getByLabelText('Model:'), 'simple');
    await user.type(screen.getByLabelText('Passing average:'), '7');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(define.mock.calls[0][1].minimumAverageForFinalExam).toBeUndefined();
  });

  test('shows the message of the server when the rules are rejected', async () => {
    const user = userEvent.setup();
    define.mockRejectedValue(new Error('The passing average must be between 0 and 10'));
    const onSaved = jest.fn();
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={onSaved} />);
    await user.selectOptions(screen.getByLabelText('Model:'), 'simple');
    await user.type(screen.getByLabelText('Passing average:'), '11.5');
    await user.type(screen.getByLabelText('Minimum average for the final exam:'), '3');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The passing average must be between 0 and 10');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  test('asks for a model before saving', async () => {
    const user = userEvent.setup();
    render(<AverageCalculationSettings classObj={classWith({})} onSaved={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Select an average calculation model'));
    expect(define).not.toHaveBeenCalled();
  });
});
