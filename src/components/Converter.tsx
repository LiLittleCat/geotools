import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

import { AppShell, type Tab } from './AppShell';
import { Icon } from './Icon';
import { TILE_STYLES } from '../lib/constants';
import {
  parseGeometry,
  geomStats,
  transformGeom,
  stringifyGeom,
  type Geom,
} from '../lib/parse';
import {
  CRS_PRESETS,
  CRS_PRESETS_UTM_NS,
  crsShort,
  isUtmCrs,
  proj4,
  resolveCrs,
} from '../lib/proj';
import { addGeomToGroup } from '../lib/leaflet-helpers';

interface ConverterShellProps {
  tab: Tab;
  setTab: (t: Tab) => void;
}

type ApplyOrigin = 'none' | 'after' | 'before';

function Converter() {
  const [mode, setMode] = useState<'format' | 'crs'>(() => {
    try {
      return (localStorage.getItem('geotools.convMode') as 'format' | 'crs') || 'crs';
    } catch {
      return 'crs';
    }
  });
  useEffect(() => {
    try { localStorage.setItem('geotools.convMode', mode); } catch { /* ignore */ }
  }, [mode]);

  const [input, setInput] = useState(`{
  "type": "Polygon",
  "coordinates": [[
    [-122.515, 37.708],
    [-122.515, 37.810],
    [-122.357, 37.810],
    [-122.357, 37.708],
    [-122.515, 37.708]
  ]]
}`);
  const [outFormat, setOutFormat] = useState<'GeoJSON' | 'WKT'>('WKT');
  const [fromCrs, setFromCrs] = useState('EPSG:4326');
  const [toCrs, setToCrs] = useState('EPSG:32650');
  const [originX, setOriginX] = useState<number | string>(0);
  const [originY, setOriginY] = useState<number | string>(0);
  const [applyOrigin, setApplyOrigin] = useState<ApplyOrigin>('none');
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => parseGeometry(input), [input]);
  const utmInvolved = useMemo(() => isUtmCrs(fromCrs) || isUtmCrs(toCrs), [fromCrs, toCrs]);

  const result = useMemo(() => {
    if (!parsed.ok) return { ok: false as const, error: parsed.error || 'Empty input' };
    try {
      const isFormatMode = mode === 'format';
      const effFrom = isFormatMode ? 'EPSG:4326' : fromCrs;
      const effTo = isFormatMode ? 'EPSG:4326' : toCrs;
      const effApplyOrigin: ApplyOrigin = isFormatMode ? 'none' : applyOrigin;

      const fromP = resolveCrs(effFrom) || 'WGS84';
      const toP = resolveCrs(effTo) || 'WGS84';
      const same = fromP === toP;
      const ox = Number(originX) || 0;
      const oy = Number(originY) || 0;

      let geom: Geom = parsed.geom;
      if (!same || (effApplyOrigin !== 'none' && (ox || oy))) {
        geom = transformGeom(geom, (c) => {
          let pt: number[] = [c[0], c[1]];
          if (effApplyOrigin === 'before' && (ox || oy)) pt = [pt[0] + ox, pt[1] + oy];
          if (!same) {
            try {
              const r = proj4(fromP, toP, pt);
              pt = [r[0], r[1]];
            } catch { /* ignore */ }
          }
          if (effApplyOrigin === 'after' && (ox || oy)) pt = [pt[0] - ox, pt[1] - oy];
          return c.length > 2 ? [pt[0], pt[1], c[2]] : pt;
        });
      }

      const text = outFormat === 'WKT' ? stringifyGeom(geom, 'WKT') : JSON.stringify(geom, null, 2);
      return { ok: true as const, text, geom };
    } catch (e: any) {
      return { ok: false as const, error: e.message as string };
    }
  }, [parsed, mode, fromCrs, toCrs, originX, originY, outFormat, applyOrigin]);

  const swap = () => {
    setFromCrs(toCrs);
    setToCrs(fromCrs);
  };

  /* Preview map */
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [37.78, -122.43],
      zoom: 10,
      zoomControl: false,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(TILE_STYLES['carto-voyager'].url, {
      attribution: TILE_STYLES['carto-voyager'].attr,
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render the INPUT geometry on map (always in WGS84).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!parsed.ok) return;
    try {
      const effFrom = mode === 'format' ? 'EPSG:4326' : fromCrs;
      const effApplyOrigin: ApplyOrigin = mode === 'format' ? 'none' : applyOrigin;
      const fromP = resolveCrs(effFrom) || 'WGS84';
      const ox = Number(originX) || 0;
      const oy = Number(originY) || 0;
      let geom: Geom = parsed.geom;
      if (fromP !== 'WGS84' || (effApplyOrigin === 'before' && (ox || oy))) {
        geom = transformGeom(geom, (c) => {
          let pt: number[] = [c[0], c[1]];
          if (effApplyOrigin === 'before' && (ox || oy)) pt = [pt[0] + ox, pt[1] + oy];
          if (fromP !== 'WGS84') {
            try {
              const r = proj4(fromP, 'WGS84', pt);
              pt = [r[0], r[1]];
            } catch { /* ignore */ }
          }
          return pt;
        });
      }
      const group = L.featureGroup();
      addGeomToGroup(group, geom, '#5cc8c0');
      group.addTo(map);
      layerRef.current = group;
      const b = group.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
    } catch { /* ignore */ }
  }, [parsed, mode, fromCrs, originX, originY, applyOrigin]);

  return (
    <div className="split conv-split">
      <aside className="side">
        <div className="conv-mode-bar">
          <div className="conv-mode-label">Conversion mode</div>
          <div className="conv-mode-picker">
            <button
              className={`conv-mode-btn ${mode === 'format' ? 'active' : ''}`}
              onClick={() => setMode('format')}
            >
              <div className="conv-mode-title"><Icon name="file" size={12} /> Format</div>
              <div className="conv-mode-desc">GeoJSON ↔ WKT</div>
            </button>
            <button
              className={`conv-mode-btn ${mode === 'crs' ? 'active' : ''}`}
              onClick={() => setMode('crs')}
            >
              <div className="conv-mode-title"><Icon name="globe" size={12} /> CRS</div>
              <div className="conv-mode-desc">Reproject coordinates</div>
            </button>
          </div>
        </div>

        <div className="conv-side-body">
          <div className="conv-field">
            <div className="conv-field-head">
              <label>Input{mode === 'crs' ? ' · Source CRS' : ''}</label>
              {mode === 'crs' && (
                <select
                  className="crs-select sm"
                  value={fromCrs}
                  onChange={(e) => setFromCrs(e.target.value)}
                >
                  <optgroup label="Common">
                    {CRS_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>{p.id} — {p.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="UTM Zones">
                    {CRS_PRESETS_UTM_NS.map((p) => (
                      <option key={p.id} value={p.proj}>{p.label}</option>
                    ))}
                  </optgroup>
                </select>
              )}
            </div>
            <textarea
              className="geom-input"
              style={{
                width: '100%',
                minHeight: 180,
                borderRadius: 6,
                border: '1px solid var(--border-soft)',
                background: 'var(--bg-input)',
              }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste GeoJSON or WKT…"
              spellCheck={false}
            />
            <div className="conv-parse-status">
              {parsed.ok ? (
                <span style={{ color: 'var(--success)' }}>
                  {parsed.format} · {parsed.geom.type} · {geomStats(parsed.geom)?.vertices ?? 0} pts
                </span>
              ) : (
                <span style={{ color: 'var(--danger)' }}>⚠ {parsed.error || 'empty'}</span>
              )}
            </div>
          </div>

          {mode === 'crs' && (
            <div className="conv-field">
              <div className="conv-field-head">
                <label>Target CRS</label>
                <button
                  className="btn sm ghost"
                  onClick={swap}
                  title="Swap from/to"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >
                  ⇄ Swap
                </button>
              </div>
              <select
                className="crs-select block"
                value={toCrs}
                onChange={(e) => setToCrs(e.target.value)}
              >
                <optgroup label="Common">
                  {CRS_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.id} — {p.label}</option>
                  ))}
                </optgroup>
                <optgroup label="UTM Zones">
                  {CRS_PRESETS_UTM_NS.map((p) => (
                    <option key={p.id} value={p.proj}>{p.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          {mode === 'crs' && utmInvolved && (
            <div className="conv-field">
              <div className="conv-field-head">
                <label>Origin offset</label>
                <span className="conv-badge">UTM</span>
              </div>
              <div className="conv-row">
                <label>Mode</label>
                <div className="opt">
                  <button className={applyOrigin === 'none' ? 'active' : ''} onClick={() => setApplyOrigin('none')}>None</button>
                  <button className={applyOrigin === 'after' ? 'active' : ''} onClick={() => setApplyOrigin('after')}>Subtract after</button>
                  <button className={applyOrigin === 'before' ? 'active' : ''} onClick={() => setApplyOrigin('before')}>Add before</button>
                </div>
              </div>
              {applyOrigin !== 'none' && (
                <>
                  <div className="conv-row">
                    <label>originX</label>
                    <input
                      type="number"
                      value={originX}
                      onChange={(e) => setOriginX(e.target.value)}
                      step="0.0001"
                    />
                  </div>
                  <div className="conv-row">
                    <label>originY</label>
                    <input
                      type="number"
                      value={originY}
                      onChange={(e) => setOriginY(e.target.value)}
                      step="0.0001"
                    />
                  </div>
                  <div className="conv-hint">
                    {applyOrigin === 'after'
                      ? 'output = projected − origin (local coords)'
                      : 'input coords are offsets; absolute = input + origin'}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="conv-main">
        <div className="conv-output-bar">
          <div className="conv-output-label">
            <Icon name="arrow-right" size={12} /> <span>Output</span>
            {mode === 'crs' && <span className="conv-crs-pill">{crsShort(toCrs)}</span>}
          </div>
          <div className="conv-output-format">
            <span className="conv-format-label">Format</span>
            <div className="seg">
              <button
                className={outFormat === 'GeoJSON' ? 'active' : ''}
                onClick={() => setOutFormat('GeoJSON')}
              >
                GeoJSON
              </button>
              <button
                className={outFormat === 'WKT' ? 'active' : ''}
                onClick={() => setOutFormat('WKT')}
              >
                WKT
              </button>
            </div>
          </div>
        </div>
        <div className="conv-output-wrap">
          <textarea
            className="geom-input"
            style={{
              width: '100%',
              height: '100%',
              minHeight: 220,
              border: 'none',
              background: 'var(--bg-input)',
            }}
            value={result.ok ? result.text : `// Error: ${result.error}`}
            readOnly
            spellCheck={false}
          />
          {result.ok && (
            <button
              className="copy-btn"
              style={{ top: 10, right: 14 }}
              onClick={() => {
                try {
                  navigator.clipboard.writeText(result.text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                } catch { /* ignore */ }
              }}
              title={copied ? 'Copied!' : 'Copy'}
            >
              <Icon name={copied ? 'check' : 'copy'} size={12} />
            </button>
          )}
        </div>
        <div className="conv-map-wrap">
          <div className="conv-map-title">Preview · input reprojected to WGS84</div>
          <div className="conv-map-inner">
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConverterShell({ tab, setTab }: ConverterShellProps) {
  return (
    <>
      <AppShell tab={tab} setTab={setTab} />
      <Converter />
    </>
  );
}
