import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { AppShell, type Tab } from './AppShell';
import { Icon } from './Icon';
import { PALETTE, SAMPLES } from '../lib/constants';
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
  isUtmCrs,
  proj4,
  resolveCrs,
} from '../lib/proj';
import {
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

function useCopyable() {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return [copied, copy] as const;
}

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
  const [leftCopied, copyLeft] = useCopyable();
  const [rightCopied, copyRight] = useCopyable();

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
          <div>
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
          <button
            type="button"
            className="btn icon ghost format-copy"
            disabled={!leftValue.trim()}
            title={leftCopied ? 'Copied' : 'Copy'}
            aria-label={leftCopied ? 'Copied' : 'Copy left geometry'}
            onClick={() => copyLeft(leftValue)}
          >
            <Icon name={leftCopied ? 'check' : 'copy'} size={12} />
          </button>
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
          <div>
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
          <button
            type="button"
            className="btn icon ghost format-copy"
            disabled={!rightValue.trim()}
            title={rightCopied ? 'Copied' : 'Copy'}
            aria-label={rightCopied ? 'Copied' : 'Copy right geometry'}
            onClick={() => copyRight(rightValue)}
          >
            <Icon name={rightCopied ? 'check' : 'copy'} size={12} />
          </button>
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
}: {
  value: ConverterTextFormat;
  onChange: (value: ConverterTextFormat) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="format-toggle" aria-label={label}>
      {(['GeoJSON', 'WKT'] as ConverterTextFormat[]).map((format) => (
        <button
          key={format}
          type="button"
          className={value === format ? 'active' : ''}
          disabled={disabled && value !== format}
          onClick={() => onChange(format)}
        >
          {format}
        </button>
      ))}
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
    const nextUtm = CRS_PRESETS_UTM_NS.find((preset) => !used.has(preset.proj));
    const nextCrs = nextCommon?.id ?? nextUtm?.proj ?? 'EPSG:4326';
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
          <div className="converter-field compact">
            <span>Output</span>
            <div className="seg" aria-label="Output format">
              {(['GeoJSON', 'WKT'] as ConverterTextFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  className={outputFormat === format ? 'active' : ''}
                  onClick={() => setOutputFormat(format)}
                >
                  {format}
                </button>
              ))}
            </div>
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
          {targets.map((target, index) => (
            <TargetCard
              key={target.id}
              color={PALETTE[index % PALETTE.length]}
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
  color: string;
  parsed: ParseResult;
  fromCrs: string;
  outputFormat: ConverterTextFormat;
  target: CsrTarget;
  onChange: (patch: Partial<CsrTarget>) => void;
  onOrigin: (patch: Partial<TargetOrigin>) => void;
  onRemove: () => void;
}

function TargetCard({
  color,
  parsed,
  fromCrs,
  outputFormat,
  target,
  onChange,
  onOrigin,
  onRemove,
}: TargetCardProps) {
  const [copied, copy] = useCopyable();
  const result = useMemo(
    () => convertGeometry(parsed, fromCrs, target.crs, target.origin, outputFormat),
    [parsed, fromCrs, target.crs, target.origin, outputFormat],
  );
  const stats = result.ok ? geomStats(result.geom) : null;
  const showOrigin = isUtmCrs(target.crs) || target.crs === 'EPSG:3857';

  return (
    <article className="crs-card" style={{ '--_c': color } as CSSProperties}>
      <div className="crs-card-head">
        <span className="crs-card-swatch" />
        <div className="crs-card-main">
          <CrsSelect value={target.crs} onChange={(crs) => onChange({ crs })} />
          <div className="crs-card-meta">
            <span>{crsShort(fromCrs)} to {crsShort(target.crs)}</span>
            {result.ok ? <span>{stats?.vertices ?? 0} pts</span> : <span>{result.error}</span>}
          </div>
        </div>
        <button type="button" className="btn icon ghost danger" title="Remove target" onClick={onRemove}>
          <Icon name="trash" size={11} />
        </button>
      </div>

      {showOrigin && (
        <div className="crs-origin">
          <label className="crs-origin-toggle">
            <input
              type="checkbox"
              checked={target.origin.enabled}
              onChange={(e) => onOrigin({ enabled: e.target.checked })}
            />
            <span>Origin offset</span>
          </label>
          {target.origin.enabled && (
            <div className="crs-origin-body">
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
      )}

      <div className="crs-card-output">
        <textarea
          className={`geom-input converter-textarea ${result.ok ? '' : 'is-error'}`}
          value={result.ok ? result.text : `// Error: ${result.error}`}
          readOnly
          spellCheck={false}
        />
        <button
          type="button"
          className="btn icon ghost crs-copy"
          disabled={!result.ok}
          title={copied ? 'Copied' : 'Copy'}
          aria-label={copied ? 'Copied' : 'Copy target output'}
          onClick={() => result.ok && copy(result.text)}
        >
          <Icon name={copied ? 'check' : 'copy'} size={12} />
        </button>
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
    const fromP = resolveCrs(fromCrs) || 'WGS84';
    const toP = resolveCrs(toCrs) || 'WGS84';
    const same = fromP === toP;
    const ox = Number(origin.x) || 0;
    const oy = Number(origin.y) || 0;
    const applyOrigin = origin.enabled && (ox || oy);

    let geom: Geom = parsed.geom;
    if (!same || applyOrigin) {
      geom = transformGeom(geom, (coord) => {
        let point: number[] = [coord[0], coord[1]];
        if (applyOrigin && origin.mode === 'before') point = [point[0] + ox, point[1] + oy];
        if (!same) {
          const projected = proj4(fromP, toP, point);
          point = [projected[0], projected[1]];
        }
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

function CrsSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select
      className="crs-select block"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <optgroup label="Common">
        {CRS_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>{preset.id} - {preset.label}</option>
        ))}
      </optgroup>
      <optgroup label="UTM Zones">
        {CRS_PRESETS_UTM_NS.map((preset) => (
          <option key={preset.id} value={preset.proj}>{preset.label}</option>
        ))}
      </optgroup>
    </select>
  );
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
