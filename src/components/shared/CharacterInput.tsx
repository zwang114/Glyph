import { useEffect, useState, useCallback } from 'react';
import { BASIC_LATIN } from '../../utils/charset';

interface CharacterInputProps {
  /** Currently typed / assigned character (single char), or null. */
  value: string | null;
  /** True when the typed letter is already assigned to another canvas. */
  isDisabled: boolean;
  /** Called with every typed letter (even disabled ones — parent decides whether to commit). */
  onChange: (letter: string | null) => void;
}

// Single Set of valid Basic-Latin characters, built once at module load.
const VALID_CHARS = new Set(BASIC_LATIN.map((c) => c.char));

/**
 * Single-character input for the Character tool. Accepts any Basic-Latin
 * character (upper, lower, digits, punctuation). Empty input clears the value.
 * Parent decides whether to actually assign the letter to the canvas — when
 * the letter is already taken by another canvas, `isDisabled` is true and the
 * character renders at 40% opacity.
 */
export function CharacterInput({ value, isDisabled, onChange }: CharacterInputProps) {
  // Local text state so the input stays responsive while typing.
  const [text, setText] = useState<string>(value ?? '');

  // Sync when the external value changes (e.g., selecting a different canvas).
  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.length === 0) {
      setText('');
      onChange(null);
      return;
    }
    // Take the last typed character (replaces previous content).
    const ch = raw.slice(-1);
    if (!VALID_CHARS.has(ch)) return; // Reject non-Basic-Latin input
    setText(ch);
    onChange(ch);
  }, [onChange]);

  return (
    <div className="character-input-box">
      <input
        type="text"
        className={`character-input${isDisabled ? ' is-disabled' : ''}`}
        value={text}
        onChange={handleChange}
        maxLength={1}
        autoComplete="off"
        spellCheck={false}
        aria-label="Canvas character"
      />
    </div>
  );
}
