import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { geomStats, type ParseResult } from '../lib/parse';
import { expandedTextareaHeight } from './layer-panel-helpers';

export interface Layer {
  id: string;
  name: string;
  text: string;
  color: string;
  visible: boolean;
  locked: boolean;
  source: 'drawn' | 'file' | null;
  parseResult: ParseResult | null;
}

interface LayerPanelProps {
  layer: Layer;
  selected: boolean;
  autoRender: boolean;
  collapsed: boolean;
  palette: readonly string[];
  onSelect: (id: string) => void;
  onChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onClear: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onUpload: (id: string, file: File) => void;
  onManualRender: (id: string) => void;
  onRecolor: (id: string, color: string) => void;
  onToggleCollapsed: (id: string) => void;
}

function LayerPanelInner({
  layer, selected, autoRender, collapsed, palette,
  onSelect, onChange, onRemove, onRename, onClear,
  onToggleVisible, onToggleLock, onUpload, onManualRender, onRecolor, onToggleCollapsed,
}: LayerPanelProps) {
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const swatchWrapRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /* When this panel becomes selected from outside (e.g. Legend click or map click),
     bring the textarea into view and focus it for immediate editing. Skip if focus
     is already somewhere inside this panel (user clicked into it themselves). */
  useEffect(() => {
    if (!selected) return;
    const panel = panelRef.current;
    const ta = textareaRef.current;
    if (!panel || !ta) return;
    if (panel.contains(document.activeElement)) return;
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!collapsed) ta.focus({ preventScroll: true });
  }, [selected, collapsed]);

  useEffect(() => {
    if (!colorOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (swatchWrapRef.current && !swatchWrapRef.current.contains(e.target as Node)) {
        setColorOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setColorOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [colorOpen]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (!expanded) {
      ta.style.height = '';
      return;
    }
    ta.style.height = 'auto';
    ta.style.height = expandedTextareaHeight(ta.scrollHeight);
  }, [expanded, layer.text, collapsed]);

  const pr = layer.parseResult;
  const stats = pr && pr.ok ? geomStats(pr.geom) : null;
  const isLocked = layer.locked;
  const fail = pr && pr.ok === false ? pr : null;
  const errored = !!(fail && !fail.empty);
  const isEmpty = !pr || (!!fail && !!fail.empty);
  const errorMsg = fail ? fail.error || '' : '';

  return (
    <div
      ref={panelRef}
      className={`panel ${focused || selected ? 'focused' : ''} ${errored ? 'errored' : ''} ${isLocked ? 'locked' : ''} ${collapsed ? 'collapsed' : ''}`}
      style={{ ['--_c' as any]: layer.color } as CSSProperties}
      onClick={() => onSelect(layer.id)}
    >
      <div className="panel-head">
        <button
          type="button"
          className="btn icon ghost panel-collapse"
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!collapsed}
          onClick={(e) => { e.stopPropagation(); onToggleCollapsed(layer.id); }}
        >
          <Icon name="chevron" size={11} />
        </button>
        <span className="swatch-wrap" ref={swatchWrapRef}>
          <button
            type="button"
            className="swatch swatch-btn"
            title={isLocked ? 'Locked' : 'Change color'}
            disabled={isLocked}
            onClick={(e) => {
              e.stopPropagation();
              if (isLocked) return;
              setColorOpen((v) => !v);
            }}
            aria-label="Change layer color"
          />
          {colorOpen && !isLocked && (
            <div className="swatch-pop" onClick={(e) => e.stopPropagation()}>
              <div className="swatch-grid">
                {palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch-opt ${c.toLowerCase() === layer.color.toLowerCase() ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => { onRecolor(layer.id, c); setColorOpen(false); }}
                  />
                ))}
              </div>
              <label className="swatch-custom">
                <span>Custom</span>
                <input
                  type="color"
                  value={layer.color}
                  onChange={(e) => onRecolor(layer.id, e.target.value)}
                />
              </label>
            </div>
          )}
        </span>
        <div className="panel-name">
          <input
            value={layer.name}
            onChange={(e) => onRename(layer.id, e.target.value)}
            onFocus={(e) => e.target.select()}
            disabled={isLocked}
            spellCheck={false}
          />
        </div>
        {layer.source && <span className="meta src">{layer.source}</span>}
        {errored && <span className="meta err">error</span>}
        <button
          className="btn icon ghost"
          title={copied ? 'Copied!' : 'Copy to clipboard'}
          disabled={!layer.text}
          onClick={(e) => {
            e.stopPropagation();
            if (!layer.text) return;
            try {
              navigator.clipboard.writeText(layer.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch { /* noop */ }
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
        <button
          className={`btn icon ghost ${isLocked ? 'locked-on' : ''}`}
          title={isLocked ? 'Unlock' : 'Lock (read-only)'}
          onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
        >
          <Icon name={isLocked ? 'lock' : 'unlock'} />
        </button>
        <button
          className="btn icon ghost"
          title={!layer.visible ? 'Show' : 'Hide'}
          onClick={(e) => { e.stopPropagation(); onToggleVisible(layer.id); }}
        >
          <Icon name={!layer.visible ? 'eye-off' : 'eye'} />
        </button>
        <button
          className="btn icon ghost danger"
          title="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove(layer.id); }}
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="panel-body">
        <textarea
          ref={textareaRef}
          className={`geom-input ${expanded ? 'expanded' : ''}`}
          value={layer.text}
          onChange={(e) => onChange(layer.id, e.target.value)}
          onFocus={() => { setFocused(true); onSelect(layer.id); }}
          onBlur={() => setFocused(false)}
          placeholder={isLocked ? 'Locked — read-only base layer' : `Paste GeoJSON or WKT…\ne.g. POINT (-122.419 37.775)`}
          spellCheck={false}
          readOnly={isLocked}
        />
      </div>

      <div className="panel-foot">
        <div className="panel-foot-left">
          {pr && pr.ok && stats && (
            <span className="meta ok">{pr.format} · {pr.geom.type} · {stats.vertices} pts</span>
          )}
          {errored && <span className="err-msg" title={errorMsg}>⚠ {errorMsg}</span>}
          {isEmpty && <span style={{ color: 'var(--fg-4)' }}>Awaiting input…</span>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            accept=".geojson,.json,.wkt,.txt,application/geo+json,application/json,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(layer.id, f);
              e.target.value = '';
            }}
          />
          <button
            className="btn sm ghost"
            title={expanded ? 'Collapse full text' : 'Expand full text'}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            <Icon name="fit" size={11} />
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            className="btn sm ghost"
            title="Upload file"
            disabled={isLocked}
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          >
            <Icon name="upload" size={11} />
          </button>
          {!autoRender && !isLocked && (
            <button className="btn sm" onClick={(e) => { e.stopPropagation(); onManualRender(layer.id); }}>
              Render
            </button>
          )}
          <button
            className="btn sm ghost"
            disabled={isLocked}
            onClick={(e) => { e.stopPropagation(); onClear(layer.id); }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

export const LayerPanel = memo(LayerPanelInner);
