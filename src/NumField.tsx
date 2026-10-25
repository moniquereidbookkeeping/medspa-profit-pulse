import { useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step' | 'type'> & {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Whole numbers only (for example, number of sessions). */
  integer?: boolean;
};

/**
 * A number box that lets people clear it and retype (important on phones), instead of snapping to 0
 * on every keystroke. The calculator always receives a number inside min..max; the box tidies itself on blur.
 */
export default function NumField({ value, onChange, min, max, step = 1, integer = false, ...rest }: Props) {
  const [text, setText] = useState(String(value));
  const lastEmitted = useRef(value);

  // Keep in sync when the value is changed from outside (Reset, switching tabs, saved state).
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
        const next = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min));
        lastEmitted.current = next;
        onChange(next);
      }}
      onBlur={() => setText(String(lastEmitted.current))}
    />
  );
}
