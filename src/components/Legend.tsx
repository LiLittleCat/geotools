import type { CSSProperties } from 'react';
import type { Layer } from './LayerPanel';

interface LegendProps {
  layers: Layer[];
  onToggle: (id: string) => void;
  onZoomTo: (id: string) => void;
  crsLabel: string;
}

export function Legend({ layers, onToggle, onZoomTo, crsLabel }: LegendProps) {
  const valid = layers.filter((p) => p.parseResult && p.parseResult.ok);
  if (valid.length === 0) return null;
  return (
    <div className="legend">
      <div className="legend-title">
        <span>Layers · {valid.length}/{layers.length}</span>
        <span>{crsLabel}</span>
      </div>
      {layers.map((p) => {
        const ok = !!(p.parseResult && p.parseResult.ok);
        const type = ok && p.parseResult!.ok ? p.parseResult!.geom.type : '';
        return (
          <div
            key={p.id}
            className={`legend-row ${!p.visible ? 'hidden' : ''}`}
            onClick={() => ok && onZoomTo(p.id)}
            onDoubleClick={() => onToggle(p.id)}
            title={ok ? 'Click to zoom · double-click to toggle' : 'Not rendered'}
          >
            <span
              className="swatch"
              style={{ ['--_c' as any]: p.color, background: p.color } as CSSProperties}
            />
            <span className="lbl">{p.name}</span>
            <span className="cnt">
              {ok
                ? type.replace(/([A-Z])/g, ' $1').trim().split(' ').map((w) => w[0]).join('')
                : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
