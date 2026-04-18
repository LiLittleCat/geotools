import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';

import { Icon } from './Icon';
import { AppShell, type Tab } from './AppShell';
import { LayerPanel, type Layer } from './LayerPanel';
import { Legend } from './Legend';
import { ThemeCtx } from './ThemeCtx';

import {
  PALETTE, SAMPLES, TILE_STYLES, TWEAKS_DEFAULTS,
  type TileStyleId,
} from '../lib/constants';
import { parseGeometry, stringifyGeom, type Geom, type ParseResult } from '../lib/parse';
import { addGeomToGroup, pointIcon } from '../lib/leaflet-helpers';
import { projectCoord, utmProjString } from '../lib/proj';

interface VisualizerProps {
  tab: Tab;
  setTab: (t: Tab) => void;
}

interface MakeLayerOpts {
  name?: string;
  text?: string;
  color?: string;
  locked?: boolean;
  source?: Layer['source'];
}

function makeLayer(index: number, opts: MakeLayerOpts = {}): Layer {
  const text = opts.text || '';
  return {
    id: Math.random().toString(36).slice(2, 9),
    name: opts.name || `Geometry ${index + 1}`,
    text,
    color: opts.color || PALETTE[index % PALETTE.length],
    visible: true,
    locked: opts.locked || false,
    source: opts.source ?? null,
    parseResult: text ? parseGeometry(text) : null,
  };
}

export function Visualizer({ tab, setTab }: VisualizerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const layerGroupsRef = useRef<Record<string, L.FeatureGroup>>({});

  const [tileStyle, setTileStyle] = useState<TileStyleId>(TWEAKS_DEFAULTS.tileStyle);
  useContext(ThemeCtx); // consume theme ctx (re-render on theme change handled globally via data-theme on html)
  const [autoRender, setAutoRender] = useState<boolean>(TWEAKS_DEFAULTS.autoRender);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [coord, setCoord] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [tool, setTool] = useState<'cursor' | 'point' | 'line' | 'polygon' | 'rect'>('cursor');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [crs] = useState<'WGS84' | 'UTM'>('WGS84');
  const [utmZone] = useState(10);
  const [utmHemi] = useState<'N' | 'S'>('N');

  const layersRef = useRef<Layer[]>([]);

  const [layers, setLayers] = useState<Layer[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('geotools.layers') || 'null');
      if (saved && Array.isArray(saved) && saved.length > 0) {
        return saved.map((p: any, i: number): Layer => ({
          id: p.id || Math.random().toString(36).slice(2, 9),
          name: p.name || `Geometry ${i + 1}`,
          text: p.text || '',
          color: p.color || PALETTE[i % PALETTE.length],
          visible: p.visible !== false,
          locked: !!p.locked,
          source: p.source ?? null,
          parseResult: p.text ? parseGeometry(p.text) : null,
        }));
      }
    } catch { /* ignore */ }
    const a = makeLayer(0, { name: 'SF Bounds', text: SAMPLES.polygon });
    const b = makeLayer(1, { name: 'Route A', text: SAMPLES.line });
    return [a, b];
  });

  useEffect(() => { layersRef.current = layers; }, [layers]);

  /* pm:edit handler (bound per-layer in render effect) */
  const handlePmEdit = useCallback((ev: any) => {
    const lyrObj = ev.target;
    const id: string | undefined = lyrObj.__layerId;
    if (!id) return;
    const group = layerGroupsRef.current[id];
    if (!group) return;
    const feats: any[] = [];
    group.eachLayer((l: any) => {
      try { feats.push(l.toGeoJSON()); } catch { /* ignore */ }
    });
    let geom: Geom;
    if (feats.length === 1) geom = feats[0].geometry;
    else geom = { type: 'GeometryCollection', geometries: feats.map((f) => f.geometry) };

    setLayers((ps) => ps.map((p) => {
      if (p.id !== id) return p;
      if (p.source === 'file') return p;
      const origFormat = p.parseResult && p.parseResult.ok ? p.parseResult.format : 'GeoJSON';
      const text = origFormat === 'WKT' ? stringifyGeom(geom, 'WKT') : JSON.stringify(geom, null, 2);
      const parseResult: ParseResult = { ok: true, geom, format: origFormat };
      return { ...p, text, parseResult };
    }));
  }, []);

  /* Init map */
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [37.7749, -122.4194],
      zoom: 11,
      zoomControl: false,
      worldCopyJump: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    (map as any).pm?.setGlobalOptions({ snappable: true, snapDistance: 15 });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* Tiles */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const cfg = TILE_STYLES[tileStyle] || TILE_STYLES['carto-voyager'];
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attr,
      maxZoom: 20,
      subdomains: 'abcd',
    }).addTo(map);
  }, [tileStyle]);

  /* Coord readout */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = (e: L.LeafletMouseEvent) =>
      setCoord({ lat: e.latlng.lat, lng: e.latlng.lng, zoom: map.getZoom() });
    const onZoom = () => setCoord((c) => (c ? { ...c, zoom: map.getZoom() } : null));
    const onOut = () => setCoord(null);
    map.on('mousemove', onMove);
    map.on('zoomend', onZoom);
    map.on('mouseout', onOut);
    return () => {
      map.off('mousemove', onMove);
      map.off('zoomend', onZoom);
      map.off('mouseout', onOut);
    };
  }, []);

  /* Persist */
  useEffect(() => {
    const toSave = layers.map(({ parseResult: _pr, ...rest }) => rest);
    try {
      localStorage.setItem('geotools.layers', JSON.stringify(toSave));
    } catch { /* ignore */ }
  }, [layers]);

  /* Render layers whenever they change */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(layerGroupsRef.current).forEach((lg) => map.removeLayer(lg));
    layerGroupsRef.current = {};

    layers.forEach((p) => {
      if (p.parseResult && p.parseResult.ok && p.visible !== false) {
        const group = L.featureGroup();
        try {
          addGeomToGroup(group, p.parseResult.geom, p.color);
          group.eachLayer((l: any) => {
            l.__layerId = p.id;
            l.__locked = !!p.locked;
            l.on('click', (ev: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(ev as any);
              setSelectedId(p.id);
            });
            if (!p.locked) {
              l.on('pm:edit', handlePmEdit);
              l.on('pm:dragend', handlePmEdit);
            }
          });
          group.bindTooltip(p.name, {
            permanent: false,
            direction: 'top',
            className: 'geo-tip',
            sticky: true,
          });
          group.addTo(map);
          layerGroupsRef.current[p.id] = group;
        } catch { /* ignore */ }
      }
    });
  }, [layers, handlePmEdit]);

  /* Auto-fit when geometry set changes */
  const fitSig = layers
    .map((p) =>
      p.parseResult && p.parseResult.ok && p.visible !== false
        ? p.id + ':' + JSON.stringify(p.parseResult.geom).length
        : '',
    )
    .join('|');
  useEffect(() => {
    const t = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      const groups = Object.values(layerGroupsRef.current);
      if (groups.length === 0) return;
      const all = L.featureGroup(groups);
      const b = all.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
    }, 300);
    return () => clearTimeout(t);
  }, [fitSig]);

  /* Tool mode (draw / edit) */
  const nextAvailableColor = useCallback(() => {
    const used = new Set(layersRef.current.map((l) => l.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[layersRef.current.length % PALETTE.length];
  }, []);

  useEffect(() => {
    const map = mapRef.current as any;
    if (!map || !map.pm) return;

    map.pm.disableDraw();
    map.pm.disableGlobalEditMode();
    map.pm.disableGlobalDragMode();

    const pmStyle = () => {
      const nextColor = nextAvailableColor();
      return {
        pathOptions: { color: nextColor, weight: 2.5, fillColor: nextColor, fillOpacity: 0.18 },
        templineStyle: { color: nextColor },
        hintlineStyle: { color: nextColor, dashArray: '5,5' },
        markerStyle: { icon: pointIcon(nextColor) },
        continueDrawing: false,
      };
    };

    if (tool === 'cursor') {
      map.pm.enableGlobalEditMode({ allowSelfIntersection: true, snappable: true });
      Object.entries(layerGroupsRef.current).forEach(([id, group]) => {
        const lyr = layersRef.current.find((l) => l.id === id);
        group.eachLayer((l: any) => {
          if (lyr && lyr.locked) {
            l.pm?.disable();
            l.options.pmIgnore = true;
          } else {
            l.options.pmIgnore = false;
            l.pm?.enable({ snappable: true, allowSelfIntersection: true });
          }
        });
      });
    } else if (tool === 'point') {
      map.pm.enableDraw('Marker', {
        ...pmStyle(),
        markerStyle: { icon: pointIcon(nextAvailableColor()) },
      });
    } else if (tool === 'line') {
      map.pm.enableDraw('Line', pmStyle());
    } else if (tool === 'polygon') {
      map.pm.enableDraw('Polygon', pmStyle());
    } else if (tool === 'rect') {
      map.pm.enableDraw('Rectangle', pmStyle());
    }

    return () => {
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
    };
  }, [tool, layers.length, nextAvailableColor]);

  /* Geoman create handler */
  const addDrawnLayer = useCallback((geom: Geom) => {
    const idx = layersRef.current.length;
    const used = new Set(layersRef.current.map((l) => l.color));
    const color = PALETTE.find((c) => !used.has(c)) || PALETTE[idx % PALETTE.length];
    const name = `${geom.type} ${idx + 1}`;
    const text = JSON.stringify(geom, null, 2);
    const newLayer: Layer = {
      id: Math.random().toString(36).slice(2, 9),
      name, text, color,
      visible: true, locked: false, source: 'drawn',
      parseResult: { ok: true, geom, format: 'GeoJSON' },
    };
    setLayers((ps) => [...ps, newLayer]);
    setSelectedId(newLayer.id);
    showToast(`Created ${geom.type} as new layer`);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onCreate = (e: any) => {
      const layer = e.layer;
      let gj: any;
      try { gj = layer.toGeoJSON(); } catch { return; }
      const geom: Geom = gj.geometry || gj;
      map.removeLayer(layer);
      addDrawnLayer(geom);
      setTool('cursor');
    };
    (map as any).on('pm:create', onCreate);
    return () => {
      (map as any).off('pm:create', onCreate);
    };
  }, [addDrawnLayer]);

  function showToast(msg: string, err?: boolean) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2200);
  }

  /* Layer actions */
  const updateText = (id: string, text: string) => {
    setLayers((ps) => ps.map((p) => (p.id === id ? {
      ...p,
      text,
      source: null,
      parseResult: autoRender ? parseGeometry(text) : p.parseResult,
    } : p)));
  };
  const manualRender = (id: string) => {
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, parseResult: parseGeometry(p.text) } : p)));
  };
  const addLayer = (preset?: keyof typeof SAMPLES) => {
    setLayers((ps) => {
      const used = new Set(ps.map((l) => l.color));
      const color = PALETTE.find((c) => !used.has(c)) || PALETTE[ps.length % PALETTE.length];
      const newLayer = makeLayer(ps.length, {
        color,
        text: preset ? SAMPLES[preset] : '',
        name: preset
          ? `${preset.charAt(0).toUpperCase() + preset.slice(1)} ${ps.length + 1}`
          : `Geometry ${ps.length + 1}`,
      });
      return [...ps, newLayer];
    });
  };
  const removeLayer = (id: string) => setLayers((ps) => ps.filter((p) => p.id !== id));
  const renameLayer = (id: string, name: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));
  const clearLayer = (id: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, text: '', parseResult: null, source: null } : p)));
  const toggleVisible = (id: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)));
  const toggleLock = (id: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, locked: !p.locked } : p)));

  const handleUpload = async (id: string, file: File) => {
    try {
      const text = await file.text();
      const res = parseGeometry(text);
      if (!res.ok) {
        showToast(`Parse failed: ${res.error}`, true);
        return;
      }
      setLayers((ps) => ps.map((p) => (p.id === id ? {
        ...p,
        text: res.format === 'GeoJSON' ? JSON.stringify(res.geom, null, 2) : text,
        parseResult: res,
        source: 'file',
        name: p.name.startsWith('Geometry') ? file.name.replace(/\.[^.]+$/, '') : p.name,
      } : p)));
      showToast(`Loaded ${file.name}`);
    } catch (e: any) {
      showToast(`Read error: ${e.message}`, true);
    }
  };

  const zoomTo = (id: string) => {
    const map = mapRef.current;
    const lg = layerGroupsRef.current[id];
    if (!map || !lg) return;
    const b = lg.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
  };

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const groups = Object.values(layerGroupsRef.current);
    if (groups.length === 0) return;
    const b = L.featureGroup(groups).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
  };

  const clearAll = () =>
    setLayers((ps) => ps.map((p) => (p.locked ? p : { ...p, text: '', parseResult: null, source: null })));

  useEffect(() => {
    if (autoRender) {
      setLayers((ps) => ps.map((p) => ({ ...p, parseResult: parseGeometry(p.text) })));
    }
  }, [autoRender]);

  /* Derived */
  const renderedCount = layers.filter((p) => p.parseResult && p.parseResult.ok).length;
  const crsLabel = crs === 'WGS84' ? 'WGS84' : `UTM ${utmZone}${utmHemi}`;

  const coordDisplay = useMemo(() => {
    if (!coord) return null;
    if (crs === 'WGS84') return { a: ['lat', coord.lat.toFixed(5)], b: ['lng', coord.lng.toFixed(5)] };
    try {
      const [x, y] = projectCoord([coord.lng, coord.lat], utmProjString(utmZone, utmHemi));
      return { a: ['E', x.toFixed(1) + 'm'], b: ['N', y.toFixed(1) + 'm'] };
    } catch {
      return { a: ['lat', coord.lat.toFixed(5)], b: ['lng', coord.lng.toFixed(5)] };
    }
  }, [coord, crs, utmZone, utmHemi]);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddMenuOpen(false);
    };
    if (addMenuOpen) document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [addMenuOpen]);
  const globalFileRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <AppShell
        tab={tab}
        setTab={setTab}
        rightMeta={
          <>
            <span className="dot" /> <span>{renderedCount}/{layers.length} rendered</span>
          </>
        }
      />

      <div className="split">
        <aside className="side">
          <div className="side-header">
            <div className="side-title">Layers · {layers.length}</div>
            <div className="side-actions">
              <input
                ref={globalFileRef}
                type="file"
                style={{ display: 'none' }}
                accept=".geojson,.json,.wkt,.txt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const text = await f.text();
                    const res = parseGeometry(text);
                    if (!res.ok) {
                      showToast(`Parse failed: ${res.error}`, true);
                      return;
                    }
                    setLayers((ps) => {
                      const used = new Set(ps.map((l) => l.color));
                      const color = PALETTE.find((c) => !used.has(c)) || PALETTE[ps.length % PALETTE.length];
                      return [
                        ...ps,
                        {
                          id: Math.random().toString(36).slice(2, 9),
                          name: f.name.replace(/\.[^.]+$/, ''),
                          text: res.format === 'GeoJSON' ? JSON.stringify(res.geom, null, 2) : text,
                          color,
                          visible: true,
                          locked: false,
                          source: 'file',
                          parseResult: res,
                        },
                      ];
                    });
                    showToast(`Loaded ${f.name}`);
                  } catch (err: any) {
                    showToast(`Read error: ${err.message}`, true);
                  }
                }}
              />
              <button className="btn sm ghost" onClick={clearAll}>Clear all</button>
              <div className="add-menu" ref={addMenuRef}>
                <button className="btn sm primary" onClick={() => setAddMenuOpen((v) => !v)}>
                  <Icon name="plus" size={12} /> New Layer
                </button>
                {addMenuOpen && (
                  <div className="add-menu-pop">
                    <button onClick={() => { addLayer(); setAddMenuOpen(false); }}>
                      <Icon name="draw" size={12} /> Empty layer
                    </button>
                    <button onClick={() => { globalFileRef.current?.click(); setAddMenuOpen(false); }}>
                      <Icon name="upload" size={12} /> From file
                    </button>
                    <div className="divider" />
                    <button onClick={() => { setTool('point'); setAddMenuOpen(false); }}>
                      <Icon name="point" size={12} /> Draw point
                    </button>
                    <button onClick={() => { setTool('line'); setAddMenuOpen(false); }}>
                      <Icon name="line" size={12} /> Draw line
                    </button>
                    <button onClick={() => { setTool('polygon'); setAddMenuOpen(false); }}>
                      <Icon name="polygon" size={12} /> Draw polygon
                    </button>
                    <button onClick={() => { setTool('rect'); setAddMenuOpen(false); }}>
                      <Icon name="rect" size={12} /> Draw rectangle
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="side-scroll">
            {layers.map((p) => (
              <LayerPanel
                key={p.id}
                layer={p}
                selected={p.id === selectedId}
                onSelect={setSelectedId}
                onChange={updateText}
                onRemove={removeLayer}
                onRename={renameLayer}
                onClear={clearLayer}
                onToggleVisible={toggleVisible}
                onToggleLock={toggleLock}
                onUpload={handleUpload}
                onManualRender={manualRender}
                autoRender={autoRender}
              />
            ))}
            <button className="add-panel" onClick={() => addLayer()}>
              <Icon name="plus" size={14} /> Add layer
            </button>
          </div>
        </aside>

        <div className="map-wrap">
          <div className="map-toolbar">
            <div className="tool-group">
              <button className={`tool-btn ${tool === 'cursor' ? 'active' : ''}`} onClick={() => setTool('cursor')} title="Cursor (select/edit)">
                <Icon name="cursor" size={12} /> Cursor
              </button>
              <button className={`tool-btn ${tool === 'point' ? 'active' : ''}`} onClick={() => setTool('point')} title="Draw point">
                <Icon name="point" size={12} /> Point
              </button>
              <button className={`tool-btn ${tool === 'line' ? 'active' : ''}`} onClick={() => setTool('line')} title="Draw line">
                <Icon name="line" size={12} /> Line
              </button>
              <button className={`tool-btn ${tool === 'polygon' ? 'active' : ''}`} onClick={() => setTool('polygon')} title="Draw polygon">
                <Icon name="polygon" size={12} /> Polygon
              </button>
              <button className={`tool-btn ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} title="Draw rectangle">
                <Icon name="rect" size={12} /> Rectangle
              </button>
            </div>
            <span className="tool-hint">
              {tool === 'cursor' && 'Click a geometry to edit vertices. Drag to move.'}
              {tool === 'point' && 'Click map to place a point'}
              {tool === 'line' && 'Click to add vertices · double-click to finish'}
              {tool === 'polygon' && 'Click to add vertices · double-click to finish'}
              {tool === 'rect' && 'Click + drag to draw a rectangle'}
            </span>
          </div>

          <div className="map-inner">
            <div id="map" ref={mapContainerRef} />

            <div className="map-overlay-tl">
              <Legend layers={layers} onToggle={toggleVisible} onZoomTo={zoomTo} crsLabel={crsLabel} />
            </div>

            <div className="map-overlay-tr">
              <div className="map-btn-group">
                <button
                  className={`map-btn icon ${tweaksOpen ? 'active' : ''}`}
                  onClick={() => setTweaksOpen((v) => !v)}
                  title="Settings"
                  aria-label="Settings"
                >
                  <Icon name="settings" size={12} />
                </button>
                <button className="map-btn icon" onClick={fitAll} title="Fit all" aria-label="Fit all">
                  <Icon name="fit" size={12} />
                </button>
                {tweaksOpen && (
                  <div className="tweaks">
                    <h4>
                      <span>Settings</span>
                      <button className="btn icon ghost" onClick={() => setTweaksOpen(false)} aria-label="Close settings">
                        <Icon name="x" size={11} />
                      </button>
                    </h4>
                    <div className="tweak-row">
                      <label>Tiles</label>
                      <div className="opt">
                        {(['carto-voyager', 'carto-labels', 'osm'] as TileStyleId[]).map((t) => (
                          <button
                            key={t}
                            className={tileStyle === t ? 'active' : ''}
                            onClick={() => setTileStyle(t)}
                          >
                            {t === 'carto-voyager' ? 'Clean' : t === 'carto-labels' ? 'Labels' : 'OSM'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="tweak-row">
                      <label>Render</label>
                      <div className="opt">
                        <button className={autoRender ? 'active' : ''} onClick={() => setAutoRender(true)}>Auto</button>
                        <button className={!autoRender ? 'active' : ''} onClick={() => setAutoRender(false)}>Manual</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="map-overlay-bl">
              {coordDisplay && (
                <div className="coord-readout">
                  <span className="k">{coordDisplay.a[0]}</span> {coordDisplay.a[1]}
                  <span style={{ color: 'var(--fg-4)', margin: '0 6px' }}>·</span>
                  <span className="k">{coordDisplay.b[0]}</span> {coordDisplay.b[1]}
                  <span style={{ color: 'var(--fg-4)', margin: '0 6px' }}>·</span>
                  <span className="k">z</span> {coord?.zoom ?? '—'}
                </div>
              )}
            </div>

            {renderedCount === 0 && (
              <div className="empty">
                <div className="empty-card">
                  <h3>No geometries yet</h3>
                  <p>Paste GeoJSON/WKT, upload a file, or pick a draw tool above.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  );
}
