import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from './Icon';
import type { ConverterTextFormat } from './converter-format';

export function FormatToggle({
  value,
  onChange,
  disabled,
  label,
  hideDescription,
}: {
  value: ConverterTextFormat;
  onChange: (value: ConverterTextFormat) => void;
  disabled?: boolean;
  label: string;
  hideDescription?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const options: { value: ConverterTextFormat; description: string }[] = [
    { value: 'GeoJSON', description: 'Structured coordinate data' },
    { value: 'WKT', description: 'Compact geometry text' },
  ];
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 6;
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + gap,
        left: rect.left,
        width: rect.width,
      });
    };
    const closeOnOutside = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('click', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('click', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="format-select-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`format-select-trigger ${open ? 'open' : ''}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="format-select-copy">
          <span className="format-select-title">{selected.value}</span>
          {!hideDescription && <span className="format-select-desc">{selected.description}</span>}
        </span>
        <span className="format-select-chevron" aria-hidden="true">
          <Icon name="chevron" size={12} />
        </span>
      </button>
      {open && createPortal(
        <div className="format-select-menu" ref={menuRef} style={menuStyle} role="listbox" aria-label={label}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={`format-select-option ${active ? 'active' : ''}`}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="format-select-option-copy">
                  <span className="format-select-option-title">{option.value}</span>
                  <span className="format-select-option-desc">{option.description}</span>
                </span>
                {active && <Icon name="check" size={12} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
