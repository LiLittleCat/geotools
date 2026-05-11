import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import type { Layer } from './LayerPanel';
import { activateLegendLayer } from './legend-helpers';

type LegendRowStyle = CSSProperties & { '--_c': string };

interface LegendProps {
  layers: Layer[];
  selectedId: string | null;
  onToggle: (id: string) => void;
  onZoomTo: (id: string) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  crsLabel: string;
}

export function Legend({ layers, selectedId, onToggle, onZoomTo, onSelect, onRemove, crsLabel }: LegendProps) {
  const valid = layers.filter((p) => p.parseResult && p.parseResult.ok);
  const shown = valid.filter((p) => p.visible).length;
  if (valid.length === 0) return null;
  return (
    <div className="legend">
      <div className="legend-title">
        <span>Layers · {shown}/{valid.length}</span>
        <span className="legend-crs-pill">{crsLabel}</span>
      </div>
      {layers.map((p) => {
        const ok = !!(p.parseResult && p.parseResult.ok);
        const type = ok && p.parseResult!.ok ? p.parseResult!.geom.type : '';
        return (
          <div
            key={p.id}
            className={`legend-row ${!p.visible ? 'hidden' : ''} ${ok ? 'clickable' : ''} ${p.id === selectedId ? 'selected' : ''}`}
            style={{ '--_c': p.color } as LegendRowStyle}
            onClick={() => {
              if (!ok) return;
              activateLegendLayer(p.id, onSelect, onZoomTo);
            }}
            title={ok ? 'Click row to select & zoom' : 'Not rendered'}
          >
            <span
              className="swatch"
              style={{ background: p.color } as CSSProperties}
            />
            <span className="lbl">{p.name}</span>
            <span className="cnt">
              {ok
                ? type.replace(/([A-Z])/g, ' $1').trim().split(' ').map((w) => w[0]).join('')
                : '—'}
            </span>
            <span className="legend-actions">
              <button
                type="button"
                className="legend-act"
                title="Zoom to layer"
                aria-label="Zoom to layer"
                disabled={!ok}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!ok) return;
                  activateLegendLayer(p.id, onSelect, onZoomTo);
                }}
              >
                <Icon name="locate" size={11} />
              </button>
              <button
                type="button"
                className="legend-act"
                title={p.visible ? 'Hide' : 'Show'}
                aria-label={p.visible ? 'Hide layer' : 'Show layer'}
                onClick={(e) => { e.stopPropagation(); onToggle(p.id); }}
              >
                <Icon name={p.visible ? 'eye' : 'eye-off'} size={11} />
              </button>
              <button
                type="button"
                className="legend-act danger"
                title="Remove layer"
                aria-label="Remove layer"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(p.id);
                }}
              >
                <Icon name="trash" size={11} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
