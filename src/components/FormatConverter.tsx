import { useMemo, useState } from 'react';

import { CopyIconButton } from './CopyButton';
import { FormatToggle } from './FormatToggle';
import { Icon } from './Icon';
import { SAMPLES } from '../lib/constants';
import {
  geomStats,
  parseGeometry,
  type Geom,
  type ParseResult,
} from '../lib/parse';
import {
  buildConverterCopyText,
  type ConverterTextFormat,
} from './converter-format';

type FormatSide = 'left' | 'right';

type FormatPanelResult =
  | { ok: true; geom: Geom; text: string; format?: ConverterTextFormat }
  | { ok: false; error: string };

const SAMPLE_INPUT = SAMPLES.polygon;

export function FormatConverter() {
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

function sourceResult(text: string, parsed: ParseResult): FormatPanelResult {
  if (!parsed.ok) return { ok: false, error: parsed.error || 'Empty input' };
  return {
    ok: true,
    geom: parsed.geom,
    text,
    format: parsed.format,
  };
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

function formatMeta(result: FormatPanelResult, fallbackFormat: ConverterTextFormat) {
  if (!result.ok) return null;
  const stats = geomStats(result.geom);
  if (!stats) return null;
  return `${result.format || fallbackFormat} · ${result.geom.type} · ${stats.vertices} vertices`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
