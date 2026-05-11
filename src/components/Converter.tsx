import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { AppShell, type Tab } from './AppShell';
import { CopyIconButton, CopyMenuButton } from './CopyButton';
import { Icon } from './Icon';
import { SAMPLES } from '../lib/constants';
import {
  parseGeometry,
  geomStats,
  transformGeom,
  stringifyGeom,
  type Geom,
  type ParseResult,
} from '../lib/parse';
import {
  CRS_PRESETS,
  CRS_PRESETS_UTM_NS,
  crsShort,
  resolveCrs,
  transformCoordBetweenCrs,
} from '../lib/proj';
import { CrsSelect } from './CrsSelect';
import {
  buildConverterCopyOptions,
  buildConverterCopyText,
  type ConverterTextFormat,
} from './converter-format';

interface ConverterShellProps {
  tab: Tab;
  setTab: (t: Tab) => void;
}

type ConverterModule = 'format' | 'crs';
type OriginMode = 'after' | 'before';
type FormatSide = 'left' | 'right';

interface TargetOrigin {
  enabled: boolean;
  x: number | string;
  y: number | string;
  mode: OriginMode;
}

interface CsrTarget {
  id: string;
  crs: string;
  origin: TargetOrigin;
}

type FormatPanelResult =
  | { ok: true; geom: Geom; text: string; format?: ConverterTextFormat }
  | { ok: false; error: string };

const SAMPLE_INPUT = SAMPLES.polygon;
const DEFAULT_TARGETS: CsrTarget[] = [
  { id: 'target-utm50', crs: 'EPSG:32650', origin: { enabled: false, x: 0, y: 0, mode: 'after' } },
  { id: 'target-web-mercator', crs: 'EPSG:3857', origin: { enabled: false, x: 0, y: 0, mode: 'after' } },
];

function Converter() {
  const [module, setModule] = useState<ConverterModule>(() => {
    try {
      return (localStorage.getItem('geotools.convMode') as ConverterModule) || 'crs';
    } catch {
      return 'crs';
    }
  });

  useEffect(() => {
    try { localStorage.setItem('geotools.convMode', module); } catch { /* ignore */ }
  }, [module]);

  return (
    <div className="converter-shell">
      <div className="conv-modbar" role="tablist" aria-label="Converter modules">
        <button
          type="button"
          role="tab"
          aria-selected={module === 'format'}
          className={`conv-mod ${module === 'format' ? 'active' : ''}`}
          onClick={() => setModule('format')}
        >
          <span className="conv-mod-icon"><Icon name="file" size={14} /></span>
          <span className="conv-mod-copy">
            <span className="conv-mod-title">Format Converter</span>
            <span className="conv-mod-desc">GeoJSON - WKT text conversion</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={module === 'crs'}
          className={`conv-mod ${module === 'crs' ? 'active' : ''}`}
          onClick={() => setModule('crs')}
        >
          <span className="conv-mod-icon"><Icon name="globe" size={14} /></span>
          <span className="conv-mod-copy">
            <span className="conv-mod-title">CRS Converter</span>
            <span className="conv-mod-desc">Reproject geometry to targets</span>
          </span>
        </button>
      </div>

      <div className="conv-body">
        {module === 'format' ? <FormatConverter /> : <CrsConverter />}
      </div>
    </div>
  );
}

function FormatConverter() {
  const [leftText, setLeftText] = useState(SAMPLE_INPUT);
  const [rightText, setRightText] = useState(() => {
    const initial = formatOutput(parseGeometry(SAMPLE_INPUT), 'WKT');
    return initial.ok ? initial.text : '';
  });
  const [leftFormat, setLeftFormat] = useState<ConverterTextFormat>('GeoJSON');
  const [rightFormat, setRightFormat] = useState<ConverterTextFormat>('WKT');
  const [sourceSide, setSourceSide] = useState<FormatSide>('left');

  const sourceText = sourceSide === 'left' ? leftText : rightText;
  const sourceParsed = useMemo(() => parseGeometry(sourceText), [sourceText]);
  const leftResult = useMemo(
    () => (sourceSide === 'left' ? sourceResult(leftText, sourceParsed) : formatOutput(sourceParsed, leftFormat)),
    [leftFormat, leftText, sourceParsed, sourceSide],
  );
  const rightResult = useMemo(
    () => (sourceSide === 'right' ? sourceResult(rightText, sourceParsed) : formatOutput(sourceParsed, rightFormat)),
    [rightFormat, rightText, sourceParsed, sourceSide],
  );
  const leftValue = sourceSide === 'left'
    ? leftText
    : leftResult.ok ? leftResult.text : `// Error: ${leftResult.error}`;
  const rightValue = sourceSide === 'right'
    ? rightText
    : rightResult.ok ? rightResult.text : `// Error: ${rightResult.error}`;
  const leftMeta = formatMeta(leftResult, sourceSide === 'left' && leftResult.ok ? leftResult.format ?? leftFormat : leftFormat);
  const rightMeta = formatMeta(rightResult, sourceSide === 'right' && rightResult.ok ? rightResult.format ?? rightFormat : rightFormat);
  const leftError = leftResult.ok ? null : leftResult.error;
  const rightError = rightResult.ok ? null : rightResult.error;

  const updateLeftText = (text: string) => {
    setLeftText(text);
    setSourceSide('left');
    const result = parseGeometry(text);
    if (result.ok) setLeftFormat(result.format);
  };

  const updateRightText = (text: string) => {
    setRightText(text);
    setSourceSide('right');
    const result = parseGeometry(text);
    if (result.ok) setRightFormat(result.format);
  };

  const updateLeftFormat = (format: ConverterTextFormat) => {
    const parsed = parseGeometry(leftValue);
    setLeftFormat(format);
    setSourceSide('left');
    if (parsed.ok) setLeftText(buildConverterCopyText(parsed.geom, format));
  };

  const updateRightFormat = (format: ConverterTextFormat) => {
    const parsed = parseGeometry(rightValue);
    setRightFormat(format);
    setSourceSide('right');
    if (parsed.ok) setRightText(buildConverterCopyText(parsed.geom, format));
  };

  const swapFormat = () => {
    if (sourceSide === 'left') {
      if (!rightResult.ok) return;
      setRightText(rightResult.text);
      setSourceSide('right');
      return;
    }
    if (!leftResult.ok) return;
    setLeftText(leftResult.text);
    setSourceSide('left');
  };

  return (
    <div className="format-grid">
      <section className="converter-panel">
        <div className="converter-panel-head">
          <div className="format-select-row">
            <FormatToggle
              value={leftFormat}
              onChange={updateLeftFormat}
              disabled={!leftResult.ok}
              label="Left format"
            />
          </div>
        </div>

        <div className="converter-editor-wrap">
          <textarea
            className="geom-input converter-textarea"
            value={leftValue}
            onChange={(e) => updateLeftText(e.target.value)}
            placeholder="Paste GeoJSON or WKT..."
            spellCheck={false}
          />
          <CopyIconButton
            className="btn icon ghost format-copy"
            disabled={!leftValue.trim()}
            text={leftValue}
            title="Copy"
            copiedTitle="Copied!"
            ariaLabel="Copy left geometry"
            copiedAriaLabel="Copied!"
            iconSize={12}
          />
        </div>
        <div className="format-panel-foot">
          {leftMeta ? (
            <span className="meta ok">{leftMeta}</span>
          ) : (
            <span className="converter-status error">{leftError || 'Awaiting geometry'}</span>
          )}
        </div>
      </section>

      <button
        type="button"
        className="format-swap-button"
        disabled={sourceSide === 'left' ? !rightResult.ok : !leftResult.ok}
        title="Use converted side as input"
        aria-label="Use converted side as input"
        onClick={swapFormat}
      >
        <Icon name="swap" size={18} />
      </button>

      <section className="converter-panel">
        <div className="converter-panel-head">
          <div className="format-select-row">
            <FormatToggle
              value={rightFormat}
              onChange={updateRightFormat}
              disabled={!rightResult.ok}
              label="Right format"
            />
          </div>
        </div>

        <div className="converter-editor-wrap">
          <textarea
            className={`geom-input converter-textarea ${rightResult.ok ? '' : 'is-error'}`}
            value={rightValue}
            onChange={(e) => updateRightText(e.target.value)}
            placeholder="Paste GeoJSON or WKT..."
            spellCheck={false}
          />
          <CopyIconButton
            className="btn icon ghost format-copy"
            disabled={!rightValue.trim()}
            text={rightValue}
            title="Copy"
            copiedTitle="Copied!"
            ariaLabel="Copy right geometry"
            copiedAriaLabel="Copied!"
            iconSize={12}
          />
        </div>
        <div className="format-panel-foot">
          {rightMeta ? (
            <span className="meta ok">{rightMeta}</span>
          ) : (
            <span className="converter-status error">{rightError || 'Awaiting geometry'}</span>
          )}
        </div>
      </section>
    </div>
  );
}

function FormatToggle({
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

function sourceResult(text: string, parsed: ParseResult): FormatPanelResult {
  if (!parsed.ok) return { ok: false, error: parsed.error || 'Empty input' };
  return {
    ok: true,
    geom: parsed.geom,
    text,
    format: parsed.format,
  };
}

function formatMeta(result: FormatPanelResult, fallbackFormat: ConverterTextFormat) {
  if (!result.ok) return null;
  const stats = geomStats(result.geom);
  if (!stats) return null;
  return `${result.format || fallbackFormat} · ${result.geom.type} · ${stats.vertices} vertices`;
}

function CrsConverter() {
  const [input, setInput] = useState(SAMPLE_INPUT);
  const [fromCrs, setFromCrs] = useState('EPSG:4326');
  const [outputFormat, setOutputFormat] = useState<ConverterTextFormat>('GeoJSON');
  const [targets, setTargets] = useState<CsrTarget[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('geotools.convTargets') || 'null');
      if (Array.isArray(saved) && saved.length > 0) return normalizeTargets(saved);
    } catch {
      /* ignore */
    }
    return DEFAULT_TARGETS;
  });

  useEffect(() => {
    try { localStorage.setItem('geotools.convTargets', JSON.stringify(targets)); } catch { /* ignore */ }
  }, [targets]);

  const parsed = useMemo(() => parseGeometry(input), [input]);
  const stats = parsed.ok ? geomStats(parsed.geom) : null;

  const addTarget = () => {
    const used = new Set([fromCrs, ...targets.map((target) => target.crs)]);
    const nextCommon = CRS_PRESETS.find((preset) => !used.has(preset.id));
    const nextUtm = CRS_PRESETS_UTM_NS.find((preset) => !used.has(preset.id) && !used.has(preset.proj));
    const nextCrs = nextCommon?.id ?? nextUtm?.id ?? 'EPSG:4326';
    setTargets((current) => [
      ...current,
      {
        id: Math.random().toString(36).slice(2, 9),
        crs: nextCrs,
        origin: { enabled: false, x: 0, y: 0, mode: 'after' },
      },
    ]);
  };

  const updateTarget = (id: string, patch: Partial<CsrTarget>) => {
    setTargets((current) => current.map((target) => (target.id === id ? { ...target, ...patch } : target)));
  };

  const updateOrigin = (id: string, patch: Partial<TargetOrigin>) => {
    setTargets((current) => current.map((target) => (
      target.id === id ? { ...target, origin: { ...target.origin, ...patch } } : target
    )));
  };

  const removeTarget = (id: string) => {
    setTargets((current) => current.filter((target) => target.id !== id));
  };

  return (
    <div className="crs-grid">
      <section className="crs-source converter-panel">
        <div className="converter-panel-head">
          <div>
            <div className="converter-panel-title">Source geometry</div>
            <div className="converter-panel-meta">
              <span className="conv-crs-pill">{crsShort(fromCrs)}</span>
              {parsed.ok ? (
                <span className="converter-status ok">{parsed.format} - {parsed.geom.type} - {stats?.vertices ?? 0} pts</span>
              ) : (
                <span className="converter-status error">{parsed.error || 'Awaiting geometry'}</span>
              )}
            </div>
          </div>
        </div>

        <div className="crs-source-controls">
          <label className="converter-field">
            <span>Source CRS</span>
            <CrsSelect value={fromCrs} onChange={setFromCrs} />
          </label>
          <div className="converter-field compact output-format-field">
            <span>Output</span>
            <FormatToggle
              value={outputFormat}
              onChange={setOutputFormat}
              label="Output format"
              hideDescription
            />
          </div>
        </div>

        <div className="converter-editor-wrap crs-source-editor">
          <textarea
            className="geom-input converter-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste GeoJSON or WKT..."
            spellCheck={false}
          />
        </div>
      </section>

      <section className="crs-targets">
        <div className="crs-targets-head">
          <div>
            <div className="converter-panel-title">Target CRSes</div>
            <div className="converter-panel-meta">
              <span className="conv-crs-pill">{targets.length} targets</span>
            </div>
          </div>
          <button type="button" className="btn sm primary" onClick={addTarget}>
            <Icon name="plus" size={11} /> Add target
          </button>
        </div>

        <div className="crs-targets-list">
          {targets.length === 0 && (
            <button type="button" className="crs-empty" onClick={addTarget}>
              <Icon name="plus" size={13} /> Add a target CRS
            </button>
          )}
          {targets.map((target) => (
            <TargetCard
              key={target.id}
              parsed={parsed}
              fromCrs={fromCrs}
              outputFormat={outputFormat}
              target={target}
              onChange={(patch) => updateTarget(target.id, patch)}
              onOrigin={(patch) => updateOrigin(target.id, patch)}
              onRemove={() => removeTarget(target.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

interface TargetCardProps {
  parsed: ParseResult;
  fromCrs: string;
  outputFormat: ConverterTextFormat;
  target: CsrTarget;
  onChange: (patch: Partial<CsrTarget>) => void;
  onOrigin: (patch: Partial<TargetOrigin>) => void;
  onRemove: () => void;
}

function TargetCard({
  parsed,
  fromCrs,
  outputFormat,
  target,
  onChange,
  onOrigin,
  onRemove,
}: TargetCardProps) {
  const result = useMemo(
    () => convertGeometry(parsed, fromCrs, target.crs, target.origin, outputFormat),
    [parsed, fromCrs, target.crs, target.origin, outputFormat],
  );
  const copyOptions = buildConverterCopyOptions(result.ok ? outputFormat : null);

  return (
    <article className="crs-card">
      <div className="crs-card-head">
        <div className="crs-card-main">
          <CrsSelect value={target.crs} onChange={(crs) => onChange({ crs })} />
        </div>
        <label className="crs-origin-toggle crs-origin-head-toggle">
          <input
            type="checkbox"
            checked={target.origin.enabled}
            onChange={(e) => onOrigin({ enabled: e.target.checked })}
          />
          <span>Origin offset</span>
        </label>
        <button type="button" className="btn icon ghost danger" title="Remove target" onClick={onRemove}>
          <Icon name="trash" size={11} />
        </button>
        {target.origin.enabled && (
          <div className="crs-origin-inline">
            <div className="opt">
              <button
                type="button"
                className={target.origin.mode === 'after' ? 'active' : ''}
                onClick={() => onOrigin({ mode: 'after' })}
              >
                Subtract after
              </button>
              <button
                type="button"
                className={target.origin.mode === 'before' ? 'active' : ''}
                onClick={() => onOrigin({ mode: 'before' })}
              >
                Add before
              </button>
            </div>
            <label>
              <span>X / Easting</span>
              <input
                type="number"
                value={target.origin.x}
                onChange={(e) => onOrigin({ x: e.target.value })}
                step="0.0001"
              />
            </label>
            <label>
              <span>Y / Northing</span>
              <input
                type="number"
                value={target.origin.y}
                onChange={(e) => onOrigin({ y: e.target.value })}
                step="0.0001"
              />
            </label>
          </div>
        )}
      </div>

      <div className="crs-card-output">
        <textarea
          className={`geom-input converter-textarea ${result.ok ? '' : 'is-error'}`}
          value={result.ok ? result.text : `// Error: ${result.error}`}
          readOnly
          spellCheck={false}
        />
        <CopyMenuButton
          options={copyOptions}
          getText={(format) => (result.ok ? buildConverterCopyText(result.geom, format) : '')}
          disabled={!result.ok}
          wrapClassName="crs-copy-wrap"
          buttonClassName="btn icon ghost crs-copy"
          iconSize={12}
          ariaLabel="Copy target output"
        />
      </div>
    </article>
  );
}

function formatOutput(parsed: ParseResult, outputFormat: ConverterTextFormat): FormatPanelResult {
  if (!parsed.ok) return { ok: false as const, error: parsed.error || 'Empty input' };
  try {
    return {
      ok: true as const,
      geom: parsed.geom,
      text: buildConverterCopyText(parsed.geom, outputFormat),
    };
  } catch (error: unknown) {
    return { ok: false as const, error: errorMessage(error) };
  }
}

function convertGeometry(
  parsed: ParseResult,
  fromCrs: string,
  toCrs: string,
  origin: TargetOrigin,
  outputFormat: ConverterTextFormat,
) {
  if (!parsed.ok) return { ok: false as const, error: parsed.error || 'Empty input' };
  try {
    const same = (resolveCrs(fromCrs) || fromCrs) === (resolveCrs(toCrs) || toCrs);
    const ox = Number(origin.x) || 0;
    const oy = Number(origin.y) || 0;
    const applyOrigin = origin.enabled && (ox || oy);

    let geom: Geom = parsed.geom;
    if (!same || applyOrigin) {
      geom = transformGeom(geom, (coord) => {
        let point: number[] = [coord[0], coord[1]];
        if (applyOrigin && origin.mode === 'before') point = [point[0] + ox, point[1] + oy];
        if (!same) point = transformCoordBetweenCrs(point, fromCrs, toCrs);
        if (applyOrigin && origin.mode === 'after') point = [point[0] - ox, point[1] - oy];
        return coord.length > 2 ? [point[0], point[1], coord[2]] : point;
      });
    }

    return {
      ok: true as const,
      geom,
      text: stringifyGeom(geom, outputFormat),
    };
  } catch (error: unknown) {
    return { ok: false as const, error: errorMessage(error) };
  }
}

function normalizeTargets(saved: unknown[]): CsrTarget[] {
  return saved
    .filter(isRecord)
    .map((target, index) => {
      const origin = isRecord(target.origin) ? target.origin : {};
      return {
        id: typeof target.id === 'string' ? target.id : `target-${index}`,
        crs: typeof target.crs === 'string' ? target.crs : 'EPSG:3857',
        origin: {
          enabled: !!(origin.enabled ?? origin.on),
          x: typeof origin.x === 'string' || typeof origin.x === 'number' ? origin.x : 0,
          y: typeof origin.y === 'string' || typeof origin.y === 'number' ? origin.y : 0,
          mode: origin.mode === 'before' ? 'before' : 'after',
        },
      };
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ConverterShell({ tab, setTab }: ConverterShellProps) {
  return (
    <>
      <AppShell tab={tab} setTab={setTab} />
      <Converter />
    </>
  );
}
