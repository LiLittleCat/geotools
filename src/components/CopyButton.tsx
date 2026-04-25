import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface CopyOption<T extends string> {
  label: string;
  value: T;
  active?: boolean;
}

async function writeClipboardText(text: string) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through */
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function useCopiedState() {
  const [copied, setCopied] = useState(false);

  const copyText = async (text: string) => {
    if (!text) return;
    await writeClipboardText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return [copied, copyText] as const;
}

export function CopyIconButton({
  text,
  disabled,
  className,
  iconSize = 12,
  title = 'Copy',
  copiedTitle = 'Copied!',
  ariaLabel = 'Copy',
  copiedAriaLabel = 'Copied!',
}: {
  text: string;
  disabled?: boolean;
  className: string;
  iconSize?: number;
  title?: string;
  copiedTitle?: string;
  ariaLabel?: string;
  copiedAriaLabel?: string;
}) {
  const [copied, copyText] = useCopiedState();

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={copied ? copiedTitle : title}
      aria-label={copied ? copiedAriaLabel : ariaLabel}
      onClick={() => copyText(text)}
    >
      <Icon name={copied ? 'check' : 'copy'} size={iconSize} />
    </button>
  );
}

export function CopyMenuButton<T extends string>({
  options,
  getText,
  disabled,
  wrapClassName,
  buttonClassName,
  iconSize = 11,
  title = 'Copy as GeoJSON or WKT',
  copiedTitle = 'Copied!',
  ariaLabel = 'Copy as GeoJSON or WKT',
  copiedAriaLabel = 'Copied!',
}: {
  options: readonly CopyOption<T>[];
  getText: (value: T) => string;
  disabled?: boolean;
  wrapClassName?: string;
  buttonClassName: string;
  iconSize?: number;
  title?: string;
  copiedTitle?: string;
  ariaLabel?: string;
  copiedAriaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, copyText] = useCopiedState();
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <span className={`panel-input-menu-wrap ${wrapClassName || ''}`} ref={wrapRef}>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        title={copied ? copiedTitle : title}
        aria-label={copied ? copiedAriaLabel : ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          setOpen((current) => !current);
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={iconSize} />
      </button>
      {open && !disabled && (
        <div className="panel-input-menu" onClick={(event) => event.stopPropagation()}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="panel-input-menu-item"
              onClick={async () => {
                await copyText(getText(option.value));
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
