import { useRef, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { geomStats, type ParseResult } from '../lib/parse';

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
  onSelect: (id: string) => void;
  onChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onClear: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onUpload: (id: string, file: File) => void;
  onManualRender: (id: string) => void;
}

export function LayerPanel({
  layer, selected, autoRender,
  onSelect, onChange, onRemove, onRename, onClear,
  onToggleVisible, onToggleLock, onUpload, onManualRender,
}: LayerPanelProps) {
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pr = layer.parseResult;
  const stats = pr && pr.ok ? geomStats(pr.geom) : null;
  const isLocked = layer.locked;
  const fail = pr && pr.ok === false ? pr : null;
  const errored = !!(fail && !fail.empty);
  const isEmpty = !pr || (!!fail && !!fail.empty);
  const errorMsg = fail ? fail.error || '' : '';

  return (
    <div
      className={`panel ${focused || selected ? 'focused' : ''} ${errored ? 'errored' : ''} ${isLocked ? 'locked' : ''}`}
      style={{ ['--_c' as any]: layer.color } as CSSProperties}
      onClick={() => onSelect(layer.id)}
    >
      <div className="panel-head">
        <span className="swatch" />
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
          className="btn icon ghost"
          title="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove(layer.id); }}
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="panel-body">
        <textarea
          className="geom-input"
          value={layer.text}
          onChange={(e) => onChange(layer.id, e.target.value)}
          onFocus={() => { setFocused(true); onSelect(layer.id); }}
          onBlur={() => setFocused(false)}
          placeholder={isLocked ? 'Locked — read-only base layer' : `Paste GeoJSON or WKT…\ne.g. POINT (-122.419 37.775)`}
          spellCheck={false}
          readOnly={isLocked}
        />
        {layer.text && (
          <button
            className="copy-btn"
            title={copied ? 'Copied!' : 'Copy to clipboard'}
            onClick={(e) => {
              e.stopPropagation();
              try {
                navigator.clipboard.writeText(layer.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch { /* noop */ }
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={12} />
          </button>
        )}
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
