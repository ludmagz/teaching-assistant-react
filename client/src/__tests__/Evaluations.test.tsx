import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Evaluations from '../components/Evaluations';
import { classService } from '../services/ClassService';
import { enrollmentService } from '../services/EnrollmentService';
import { softwareEngineering, databases } from '../test-support/fixtures';

jest.mock('../services/ClassService', () => ({ classService: { getAllClasses: jest.fn() } }));
jest.mock('../services/EnrollmentService', () => ({ enrollmentService: { updateEvaluation: jest.fn() } }));

const GOALS = ['Requirements', 'Configuration Management', 'Project Management', 'Design', 'Tests', 'Refactoring'];

describe('Evaluations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([softwareEngineering, databases]);
  });

  test('asks for a class until one is selected', async () => {
    render(<Evaluations onError={jest.fn()} />);
    expect(await screen.findByRole('option', { name: 'Software Engineering (2025/1)' })).toBeInTheDocument();
    expect(screen.getByText('No Class Selected')).toBeInTheDocument();
  });

  test('shows one column per goal and one row per enrolled student, with the current grades', async () => {
    const user = userEvent.setup();
    render(<Evaluations onError={jest.fn()} />);
    await user.selectOptions(await screen.findByLabelText('Select Class:'), 'Software Engineering-2025-1');
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toEqual(['Student', ...GOALS, 'AVERAGE', 'Performance vs. class', 'Prior failures']);
    const row = screen.getByRole('row', { name: /Ana Lima/ });
    const selects = within(row).getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects).toHaveLength(6);
    expect(selects[3].value).toBe('MPA');
    expect(selects[3]).toHaveClass('grade-mpa');
    expect(selects[0].value).toBe('');
    expect(within(selects[0]).getAllByRole('option').map(o => o.textContent)).toEqual(['-', 'MANA', 'MPA', 'MA']);
    expect(localStorage.getItem('evaluations-selected-class')).toBe('Software Engineering-2025-1');
  });

  test('remembers the selected class across renders', async () => {
    localStorage.setItem('evaluations-selected-class', 'Databases-2024-2');
    render(<Evaluations onError={jest.fn()} />);
    expect(await screen.findByText('No Students Enrolled')).toBeInTheDocument();
  });

  test.each([
    [7, 'approved'],
    [3, 'final'],
    [0, 'failed'],
    [null, null]
  ] as const)('shows average %s with status %s', async (average, status) => {
    const user = userEvent.setup();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([{
      ...softwareEngineering,
      gradingThresholds: { minimumAverageToPass: 7, minimumAverageForFinalExam: 3 },
      enrollments: [{ ...softwareEngineering.enrollments[0], averageBeforeFinalExam: average }]
    }]);
    render(<Evaluations onError={jest.fn()} />);
    await user.selectOptions(await screen.findByLabelText('Select Class:'), softwareEngineering.id);
    const cell = within(screen.getByRole('row', { name: /Ana Lima/ })).getByTestId('numeric-average');
    expect(cell.textContent).toBe(average == null ? '-' : String(average));
    if (status) {
      expect(cell).toHaveClass(`average-${status}`);
    } else {
      expect(cell.className).toBe('evaluation-cell average-cell');
    }
  });

  test('shows a numeric average without a status color when thresholds are missing', async () => {
    const user = userEvent.setup();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([{
      ...softwareEngineering,
      enrollments: [{ ...softwareEngineering.enrollments[0], averageBeforeFinalExam: 7 }]
    }]);
    render(<Evaluations onError={jest.fn()} />);
    await user.selectOptions(await screen.findByLabelText('Select Class:'), softwareEngineering.id);
    const cell = within(screen.getByRole('row', { name: /Ana Lima/ })).getByTestId('numeric-average');
    expect(cell.textContent).toBe('7');
    expect(cell.className).toBe('evaluation-cell average-cell');
  });

  test('changing a grade updates the evaluation and reloads the classes', async () => {
    const user = userEvent.setup();
    (enrollmentService.updateEvaluation as jest.Mock).mockResolvedValue({});
    const onError = jest.fn();
    render(<Evaluations onError={onError} />);
    await user.selectOptions(await screen.findByLabelText('Select Class:'), 'Software Engineering-2025-1');
    const row = screen.getByRole('row', { name: /Ana Lima/ });
    await user.selectOptions(within(row).getAllByRole('combobox')[4], 'MA');
    await waitFor(() => expect(enrollmentService.updateEvaluation).toHaveBeenCalledWith('Software Engineering-2025-1', '123.456.789-01', 'Tests', 'MA'));
    await waitFor(() => expect(classService.getAllClasses).toHaveBeenCalledTimes(2));
    expect(onError).not.toHaveBeenCalled();
  });

  test('reports a failed grade update', async () => {
    const user = userEvent.setup();
    (enrollmentService.updateEvaluation as jest.Mock).mockRejectedValue(new Error('Class not found'));
    const onError = jest.fn();
    render(<Evaluations onError={onError} />);
    await user.selectOptions(await screen.findByLabelText('Select Class:'), 'Software Engineering-2025-1');
    const row = screen.getByRole('row', { name: /Ana Lima/ });
    await user.selectOptions(within(row).getAllByRole('combobox')[0], 'MANA');
    // reported next to the table, where the grade was changed
    expect(await screen.findByTestId('grade-feedback')).toHaveTextContent('Failed to update evaluation: Class not found');
    expect(screen.getByTestId('grade-feedback')).toHaveAttribute('role', 'alert');
    expect(onError).not.toHaveBeenCalled();
  });

  const classWithModel = (model: 'simple' | 'concepts' | undefined, evaluations: object[]) => ({
    ...softwareEngineering,
    averageCalculationSpecification: { ...softwareEngineering.averageCalculationSpecification, model },
    enrollments: [{ ...softwareEngineering.enrollments[0], evaluations }]
  });

  const selectSoftwareEngineering = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.selectOptions(await screen.findByLabelText('Select Class:'), softwareEngineering.id);
    return screen.getByRole('row', { name: /Ana Lima/ });
  };

  test('shows the average calculation settings of the selected class', async () => {
    const user = userEvent.setup();
    render(<Evaluations onError={jest.fn()} />);
    await selectSoftwareEngineering(user);
    expect(screen.getByLabelText('Model:')).toHaveValue('concepts');
  });

  test('confirms a grade update with a message', async () => {
    const user = userEvent.setup();
    (enrollmentService.updateEvaluation as jest.Mock).mockResolvedValue({});
    render(<Evaluations onError={jest.fn()} />);
    const row = await selectSoftwareEngineering(user);
    await user.selectOptions(within(row).getAllByRole('combobox')[4], 'MA');
    expect(await screen.findByRole('status')).toHaveTextContent('The grade of Ana Lima was updated successfully.');
  });

  test('shows numeric fields in a numeric model, including a grade 0', async () => {
    const user = userEvent.setup();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([classWithModel('simple', [{ goal: 'Design', grade: 0 }])]);
    render(<Evaluations onError={jest.fn()} />);
    const row = await selectSoftwareEngineering(user);
    expect(within(row).queryAllByRole('combobox')).toHaveLength(0);
    expect(within(row).getByLabelText('Ana Lima — Design')).toHaveValue('0');
    expect(within(row).getByLabelText('Ana Lima — Tests')).toHaveValue('');
  });

  test('sends a typed numeric grade as a number, accepting a decimal comma', async () => {
    const user = userEvent.setup();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([classWithModel('simple', [])]);
    (enrollmentService.updateEvaluation as jest.Mock).mockResolvedValue({});
    render(<Evaluations onError={jest.fn()} />);
    const row = await selectSoftwareEngineering(user);
    await user.type(within(row).getByLabelText('Ana Lima — Tests'), '6,9{Enter}');
    await waitFor(() => expect(enrollmentService.updateEvaluation)
      .toHaveBeenCalledWith('Software Engineering-2025-1', '123.456.789-01', 'Tests', 6.9));
  });

  test('does not send a typed text that is not a number', async () => {
    const user = userEvent.setup();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([classWithModel('simple', [])]);
    const onError = jest.fn();
    render(<Evaluations onError={onError} />);
    const row = await selectSoftwareEngineering(user);
    await user.type(within(row).getByLabelText('Ana Lima — Tests'), 'abc{Enter}');
    expect(screen.getByTestId('grade-feedback')).toHaveTextContent('"abc" is not a number');
    expect(onError).not.toHaveBeenCalled();
    expect(enrollmentService.updateEvaluation).not.toHaveBeenCalled();
    expect(within(row).getByLabelText('Ana Lima — Tests')).toHaveValue('');
  });

  test('shows the stored grade again when the server rejects the typed one', async () => {
    const user = userEvent.setup();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([classWithModel('simple', [])]);
    (enrollmentService.updateEvaluation as jest.Mock)
      .mockRejectedValue(new Error('Invalid grade. Must be MANA, MPA, MA or a number from 0 to 10'));
    render(<Evaluations onError={jest.fn()} />);
    const row = await selectSoftwareEngineering(user);
    const tests = within(row).getByLabelText('Ana Lima — Tests');
    await user.type(tests, '11{Enter}');
    expect(await screen.findByTestId('grade-feedback'))
      .toHaveTextContent('Failed to update evaluation: Invalid grade. Must be MANA, MPA, MA or a number from 0 to 10');
    await waitFor(() => expect(tests).toHaveValue(''));
  });

  test('replaces the message of the previous grade change with the new one', async () => {
    const user = userEvent.setup();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([classWithModel('simple', [])]);
    (enrollmentService.updateEvaluation as jest.Mock).mockResolvedValue({});
    render(<Evaluations onError={jest.fn()} />);
    const row = await selectSoftwareEngineering(user);
    await user.type(within(row).getByLabelText('Ana Lima — Tests'), '8{Enter}');
    expect(await screen.findByTestId('grade-feedback')).toHaveTextContent('The grade of Ana Lima was updated successfully.');
    await user.type(within(row).getByLabelText('Ana Lima — Design'), 'abc{Enter}');
    const feedback = screen.getAllByTestId('grade-feedback');
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toHaveTextContent('"abc" is not a number');
    expect(feedback[0]).toHaveClass('error-message');
  });

  test('in a class with no model, only allows removing the grades it has', async () => {
    const user = userEvent.setup();
    (classService.getAllClasses as jest.Mock).mockResolvedValue([classWithModel(undefined, [{ goal: 'Design', grade: 'MPA' }])]);
    (enrollmentService.updateEvaluation as jest.Mock).mockResolvedValue({});
    render(<Evaluations onError={jest.fn()} />);
    const row = await selectSoftwareEngineering(user);
    const design = within(row).getByLabelText('Ana Lima — Design');
    expect(within(design).getAllByRole('option').map(o => o.textContent)).toEqual(['-', 'MPA']);
    expect(within(row).getByLabelText('Ana Lima — Tests')).toBeDisabled();
    await user.selectOptions(design, '');
    await waitFor(() => expect(enrollmentService.updateEvaluation)
      .toHaveBeenCalledWith('Software Engineering-2025-1', '123.456.789-01', 'Design', ''));
  });
});
