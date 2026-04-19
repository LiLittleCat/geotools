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
import {
  buildConverterCopyOptions,
  buildConverterCopyText,
  resolveConverterOutputFormat,
} from './converter-format';

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
  const [fromCrs, setFromCrs] = useState('EPSG:4326');
  const [toCrs, setToCrs] = useState('EPSG:32650');
  const [originX, setOriginX] = useState<number | string>(0);
  const [originY, setOriginY] = useState<number | string>(0);
  const [applyOrigin, setApplyOrigin] = useState<ApplyOrigin>('none');
  const [copied, setCopied] = useState(false);
  const [copyAsOpen, setCopyAsOpen] = useState(false);
  const copyAsWrapRef = useRef<HTMLSpanElement | null>(null);

  const parsed = useMemo(() => parseGeometry(input), [input]);
  const utmInvolved = useMemo(() => isUtmCrs(fromCrs) || isUtmCrs(toCrs), [fromCrs, toCrs]);
  const inputStats = parsed.ok ? geomStats(parsed.geom) : null;
  const outputFormat = resolveConverterOutputFormat(mode, parsed);
  const copyOptions = buildConverterCopyOptions(outputFormat);

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

      const format = resolveConverterOutputFormat(mode, parsed) || 'GeoJSON';
      const text = format === 'WKT' ? stringifyGeom(geom, 'WKT') : JSON.stringify(geom, null, 2);
      return { ok: true as const, text, geom };
    } catch (e: any) {
      return { ok: false as const, error: e.message as string };
    }
  }, [parsed, mode, fromCrs, toCrs, originX, originY, applyOrigin]);
  const outputStats = result.ok ? geomStats(result.geom) : null;
  const sourceLabel = mode === 'format'
    ? (parsed.ok ? parsed.format : 'Auto-detect')
    : `${crsShort(fromCrs)} · ${parsed.ok ? parsed.format : 'Auto-detect'}`;
  const targetLabel = mode === 'format'
    ? (outputFormat || 'Output')
    : `${crsShort(toCrs)} · ${outputFormat || 'Output'}`;

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

  useEffect(() => {
    if (!copyAsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (copyAsWrapRef.current && !copyAsWrapRef.current.contains(e.target as Node)) {
        setCopyAsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCopyAsOpen(false);
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [copyAsOpen]);

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
    <div className="converter-shell">
      <section className="converter-topbar">
        <div className="converter-rail">
          <div className="converter-rail-group">
            <div className="converter-rail-label">Mode</div>
            <div className="conv-mode-picker">
              <button
                type="button"
                className={`conv-mode-btn ${mode === 'format' ? 'active' : ''}`}
                onClick={() => setMode('format')}
              >
                <div className="conv-mode-title"><Icon name="file" size={12} /> Format</div>
                <div className="conv-mode-desc">GeoJSON ↔ WKT</div>
              </button>
              <button
                type="button"
                className={`conv-mode-btn ${mode === 'crs' ? 'active' : ''}`}
                onClick={() => setMode('crs')}
              >
                <div className="conv-mode-title"><Icon name="globe" size={12} /> CRS</div>
                <div className="conv-mode-desc">Reproject coordinates</div>
              </button>
            </div>
          </div>

          <div className="converter-rail-group converter-rail-core">
            <div className="converter-rail-label">{mode === 'crs' ? 'Coordinate flow' : 'Conversion rule'}</div>
            {mode === 'crs' ? (
              <div className="converter-crs-flow">
                <select
                  className="crs-select block"
                  value={fromCrs}
                  onChange={(e) => setFromCrs(e.target.value)}
                  aria-label="Source CRS"
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
                <button
                  type="button"
                  className="converter-swap"
                  onClick={swap}
                  title="Swap source and target CRS"
                  aria-label="Swap source and target CRS"
                >
                  <Icon name="arrow-right" size={12} />
                </button>
                <select
                  className="crs-select block"
                  value={toCrs}
                  onChange={(e) => setToCrs(e.target.value)}
                  aria-label="Target CRS"
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
            ) : (
              <div className="converter-rail-note">
                Rewrites geometry text only. Coordinates stay unchanged.
              </div>
            )}
          </div>

        </div>
      </section>

      {mode === 'crs' && utmInvolved && (
        <section className="converter-offset-card">
          <div className="converter-offset-head">
            <div>
              <div className="converter-rail-label">Origin Offset</div>
              <div className="converter-offset-title">Apply a local origin before or after reprojection.</div>
            </div>
            <span className="conv-badge">UTM</span>
          </div>

          <div className="converter-offset-grid">
            <div className="converter-offset-mode">
              <div className="converter-inline-label">Mode</div>
              <div className="conv-row">
                <div className="opt">
                  <button type="button" className={applyOrigin === 'none' ? 'active' : ''} onClick={() => setApplyOrigin('none')}>None</button>
                  <button type="button" className={applyOrigin === 'after' ? 'active' : ''} onClick={() => setApplyOrigin('after')}>Subtract after</button>
                  <button type="button" className={applyOrigin === 'before' ? 'active' : ''} onClick={() => setApplyOrigin('before')}>Add before</button>
                </div>
              </div>
            </div>

            {applyOrigin !== 'none' && (
              <>
                <div className="converter-offset-inputs">
                  <div className="conv-row">
                    <label htmlFor="originX">originX</label>
                    <input
                      id="originX"
                      type="number"
                      value={originX}
                      onChange={(e) => setOriginX(e.target.value)}
                      step="0.0001"
                    />
                  </div>
                  <div className="conv-row">
                    <label htmlFor="originY">originY</label>
                    <input
                      id="originY"
                      type="number"
                      value={originY}
                      onChange={(e) => setOriginY(e.target.value)}
                      step="0.0001"
                    />
                  </div>
                </div>
                <div className="conv-hint">
                  {applyOrigin === 'after'
                    ? 'output = projected − origin, useful when the target needs local coordinates.'
                    : 'input is treated as local offsets first, then converted against the absolute origin.'}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <div className="converter-workspace">
        <section className="converter-panel">
          <div className="converter-panel-head">
            <div>
              <div className="converter-panel-title">Input Geometry</div>
              <div className="converter-panel-meta">
                <span className="conv-crs-pill">{sourceLabel}</span>
                {parsed.ok ? (
                  <span className="converter-status ok">
                    {parsed.geom.type} · {inputStats?.vertices ?? 0} vertices
                  </span>
                ) : (
                  <span className="converter-status error">{parsed.error || 'Awaiting geometry'}</span>
                )}
              </div>
            </div>
          </div>

          <div className="converter-editor-wrap">
            <textarea
              className="geom-input converter-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste GeoJSON or WKT…"
              spellCheck={false}
            />
          </div>
        </section>

        <section className="converter-panel">
          <div className="converter-panel-head">
            <div>
              <div className="converter-panel-title">Output Geometry</div>
              <div className="converter-panel-meta">
                <span className="conv-crs-pill">{targetLabel}</span>
                {result.ok ? (
                  <span className="converter-status ok">
                    {result.geom.type} · {outputStats?.vertices ?? 0} vertices
                  </span>
                ) : (
                  <span className="converter-status error">{result.error}</span>
                )}
              </div>
            </div>

            {result.ok && (
              <span className="panel-input-menu-wrap converter-copy-wrap" ref={copyAsWrapRef}>
                <button
                  type="button"
                  className="btn icon ghost converter-copy"
                  onClick={() => setCopyAsOpen((v) => !v)}
                  title={copied ? 'Copied!' : 'Copy as GeoJSON or WKT'}
                  aria-label={copied ? 'Copied!' : 'Copy as GeoJSON or WKT'}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={12} />
                </button>
                {copyAsOpen && (
                  <div className="panel-input-menu" onClick={(e) => e.stopPropagation()}>
                    {copyOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`panel-input-menu-item ${option.active ? 'active' : ''}`}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(buildConverterCopyText(result.geom, option.value));
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1200);
                          } catch { /* ignore */ }
                          setCopyAsOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                    <div className="panel-input-menu-note">WKT copies geometry only.</div>
                  </div>
                )}
              </span>
            )}
          </div>

          <div className="converter-editor-wrap">
            <textarea
              className={`geom-input converter-textarea ${result.ok ? '' : 'is-error'}`}
              value={result.ok ? result.text : `// Error: ${result.error}`}
              readOnly
              spellCheck={false}
            />
          </div>
        </section>
      </div>

      <section className="converter-preview-panel">
        <div className="converter-preview-head">
          <div>
            <div className="converter-panel-title">Spatial Preview</div>
            <div className="converter-preview-meta">
              Input geometry normalized to WGS84 for a quick footprint check.
            </div>
          </div>
          <div className="converter-preview-pills">
            <span className="conv-crs-pill">{mode === 'crs' ? `${crsShort(fromCrs)} → WGS84` : 'WGS84 preview'}</span>
          </div>
        </div>
        <div className="converter-map-inner">
          <div ref={containerRef} className="converter-map-canvas" />
        </div>
      </section>
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
