import { useEffect, useMemo, useState } from 'react';

import { CopyMenuButton } from './CopyButton';
import { CrsSelect } from './CrsSelect';
import { FormatToggle } from './FormatToggle';
import { Icon } from './Icon';
import { SAMPLES } from '../lib/constants';
import {
  geomStats,
  parseGeometry,
  stringifyGeom,
  transformGeom,
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
import {
  buildConverterCopyOptions,
  buildConverterCopyText,
  type ConverterTextFormat,
} from './converter-format';

type OriginMode = 'after' | 'before';

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

const SAMPLE_INPUT = SAMPLES.polygon;
const DEFAULT_TARGETS: CsrTarget[] = [
  { id: 'target-utm50', crs: 'EPSG:32650', origin: { enabled: false, x: 0, y: 0, mode: 'after' } },
  { id: 'target-web-mercator', crs: 'EPSG:3857', origin: { enabled: false, x: 0, y: 0, mode: 'after' } },
];

export function CrsConverter() {
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
        <button type="button" className="btn icon ghost danger crs-target-remove" title="Remove target" onClick={onRemove}>
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
