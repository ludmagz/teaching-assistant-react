import React, { useEffect, useState } from 'react';

interface NumericGradeInputProps {
  grade: number | undefined;                       // Grade currently stored, if any
  label: string;                                   // Accessible name, e.g. "Marina — Requirements"
  onCommit: (grade: number | '') => Promise<boolean>; // A new grade, or '' to remove the stored one; resolves to whether it was accepted
  onInvalid: (message: string) => void;            // Text that is not a number was typed
}

/**
 * Field for a numeric grade from 0 to 10. What is typed is sent when the
 * field loses focus or Enter is pressed, and only if it changed; a decimal
 * comma is accepted, and an empty field removes the grade. The range is
 * checked by the server.
 */
const NumericGradeInput: React.FC<NumericGradeInputProps> = ({ grade, label, onCommit, onInvalid }) => {
  const stored = grade === undefined ? '' : String(grade);
  const [text, setText] = useState(stored);

  // Show the stored grade again whenever it changes
  useEffect(() => setText(stored), [stored]);

  // A rejected grade leaves the stored one unchanged, so it must be shown again here
  const send = async (grade: number | '') => {
    if (!(await onCommit(grade))) {
      setText(stored);
    }
  };

  const commit = () => {
    const typed = text.trim();
    if (typed === stored) {
      return;
    }
    if (typed === '') {
      send('');
      return;
    }
    const value = Number(typed.replace(',', '.'));
    if (!Number.isFinite(value)) {
      // NaN would reach the server as null, which removes the grade
      onInvalid(`"${typed}" is not a number`);
      setText(stored);
      return;
    }
    send(value);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className="evaluation-input"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      placeholder="-"
    />
  );
};

export default NumericGradeInput;
