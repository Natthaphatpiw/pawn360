'use client';

import { useId, useMemo, useState } from 'react';

type VolumeSliderProps = {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

export default function VolumeSlider({
  value,
  defaultValue = 0.7,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled = false,
  className = '',
  ariaLabel,
}: VolumeSliderProps) {
  const isControlled = typeof value === 'number';
  const [internalValue, setInternalValue] = useState(defaultValue);
  const sliderId = useId();

  const currentValue = isControlled ? value : internalValue;
  const safeRange = max - min || 1;
  const percentage = useMemo(() => {
    const normalized = ((currentValue - min) / safeRange) * 100;
    return Math.min(100, Math.max(0, normalized));
  }, [currentValue, min, safeRange]);

  const handleChange = (nextValue: number) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  };

  return (
    <div className={className}>
      <div className="volume-slider-shell relative h-8">
        <div
          className="volume-slider-track absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: `linear-gradient(90deg, var(--grad-primary-start) 0%, var(--grad-primary-end) ${percentage}%, var(--background-subtle) ${percentage}%, var(--background-subtle) 100%)`,
          }}
        />
        <input
          id={sliderId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(event) => handleChange(Number(event.target.value))}
          className="volume-slider absolute inset-y-0 left-[-16px] w-[calc(100%+32px)] cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}
