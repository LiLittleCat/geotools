import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';

import { Icon } from './Icon';
import { AppShell, type Tab } from './AppShell';
import { LayerPanel, type Layer } from './LayerPanel';
import { Legend } from './Legend';
import { ThemeCtx } from './ThemeCtx';
import { CrsSelect } from './CrsSelect';

import {
  PALETTE, SAMPLES, TILE_STYLES, TWEAKS_DEFAULTS,
  type TileStyleId,
} from '../lib/constants';
import {
  extractSingleFeatureName,
  parseGeometry,
  stringifyGeom,
  type Geom,
  type ParseResult,
} from '../lib/parse';
import { addGeomToGroup, pointIcon } from '../lib/leaflet-helpers';
import { crsShort, isUtmCrs } from '../lib/proj';
import {
  isProjectedDisplayCrs,
  mapCoordToSourceCoord,
  mapGeomToSourceGeom,
  numericCoordinateOffset,
  sourceGeomToMapGeom,
} from '../lib/crs-transform';
import {
  buildLayerEditOptions,
  shouldSyncLayerEdit,
  syncDraggedEditMarkers,
} from './visualizer-editing';
import { drawnLayerName } from './visualizer-layer-naming';
import {
  buildAllLayersGeoJsonExport,
  buildAllLayersWktExport,
  type WktExportMode,
} from './visualizer-export';

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

interface VisualizerCrsOffset {
  enabled: boolean;
  x: number | string;
  y: number | string;
}

type DrawTool = 'cursor' | 'point' | 'line' | 'polygon' | 'rect' | 'circle';
type MeasurementTool = 'measure-distance' | 'measure-area' | 'direction';
type Tool = DrawTool | MeasurementTool;
type MeasurementKind = 'distance' | 'area' | 'direction';
type LengthUnit = 'm' | 'km' | 'mi' | 'ft';
type AreaUnit = 'm2' | 'km2' | 'ha' | 'acre';

interface BaseMeasurementResult {
  id: string;
  kind: MeasurementKind;
  title: string;
}

interface DistanceMeasurementResult extends BaseMeasurementResult {
  kind: 'distance';
  meters: number;
  pointCount: number;
  lengthUnit: LengthUnit;
}

interface AreaMeasurementResult extends BaseMeasurementResult {
  kind: 'area';
  squareMeters: number;
  perimeterMeters: number;
  areaUnit: AreaUnit;
  perimeterUnit: LengthUnit;
}

interface DirectionMeasurementResult extends BaseMeasurementResult {
  kind: 'direction';
  bearing: number;
  meters: number;
  lengthUnit: LengthUnit;
  angles: { label: 'E' | 'S' | 'W' | 'N'; degrees: number }[];
}

type MeasurementResult = DistanceMeasurementResult | AreaMeasurementResult | DirectionMeasurementResult;

type MeasurementLayer = L.Layer & {
  getLatLngs?: () => unknown;
  setStyle?: (style: L.PathOptions) => void;
};

const MAP_ZOOM_STEP = 0.5;
const WHEEL_ZOOM_LOCK_MS = 140;
const MEASURE_COLOR = '#f97316';
const EARTH_RADIUS_METERS = 6378137;
const LENGTH_UNITS: { id: LengthUnit; label: string }[] = [
  { id: 'm', label: 'm' },
  { id: 'km', label: 'km' },
  { id: 'mi', label: 'mi' },
  { id: 'ft', label: 'ft' },
];
const AREA_UNITS: { id: AreaUnit; label: string }[] = [
  { id: 'm2', label: 'm²' },
  { id: 'km2', label: 'km²' },
  { id: 'ha', label: 'ha' },
  { id: 'acre', label: 'acre' },
];
const DEFAULT_VISUALIZER_CRS = 'EPSG:4326';
const DEFAULT_VISUALIZER_OFFSET: VisualizerCrsOffset = { enabled: false, x: 0, y: 0 };

function isMeasurementTool(tool: Tool): tool is MeasurementTool {
  return tool === 'measure-distance' || tool === 'measure-area' || tool === 'direction';
}

function flattenLatLngs(value: unknown): L.LatLng[] {
  if (value instanceof L.LatLng) return [value];
  if (Array.isArray(value)) return value.flatMap((item) => flattenLatLngs(item));
  return [];
}

function formatDistanceForUnit(meters: number, unit: LengthUnit) {
  if (unit === 'km') return `${(meters / 1000).toFixed(3)} km`;
  if (unit === 'mi') return `${(meters / 1609.344).toFixed(3)} mi`;
  if (unit === 'ft') return `${(meters * 3.28084).toFixed(1)} ft`;
  return `${meters.toFixed(1)} m`;
}

function formatAreaForUnit(squareMeters: number, unit: AreaUnit) {
  if (unit === 'km2') return `${(squareMeters / 1_000_000).toFixed(4)} km²`;
  if (unit === 'ha') return `${(squareMeters / 10_000).toFixed(3)} ha`;
  if (unit === 'acre') return `${(squareMeters / 4046.8564224).toFixed(3)} acre`;
  return `${squareMeters.toFixed(1)} m²`;
}

function pathDistance(points: L.LatLng[]) {
  return points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    return sum + points[index - 1].distanceTo(point);
  }, 0);
}

function polygonArea(points: L.LatLng[]) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const lng1 = (p1.lng * Math.PI) / 180;
    const lng2 = (p2.lng * Math.PI) / 180;
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((area * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2);
}

function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function bearingDegrees(start: L.LatLng, end: L.LatLng) {
  const lat1 = (start.lat * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const dLng = ((end.lng - start.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function angleBetweenDegrees(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function formatAngle(degrees: number) {
  return `${degrees.toFixed(2)}° / ${((degrees * Math.PI) / 180).toFixed(4)} rad`;
}

function distanceNumberForUnit(meters: number, unit: LengthUnit) {
  if (unit === 'km') return (meters / 1000).toFixed(3);
  if (unit === 'mi') return (meters / 1609.344).toFixed(3);
  if (unit === 'ft') return (meters * 3.28084).toFixed(1);
  return meters.toFixed(1);
}

function areaNumberForUnit(squareMeters: number, unit: AreaUnit) {
  if (unit === 'km2') return (squareMeters / 1_000_000).toFixed(4);
  if (unit === 'ha') return (squareMeters / 10_000).toFixed(3);
  if (unit === 'acre') return (squareMeters / 4046.8564224).toFixed(3);
  return squareMeters.toFixed(1);
}

function measurementPrimary(item: MeasurementResult) {
  if (item.kind === 'distance') return formatDistanceForUnit(item.meters, item.lengthUnit);
  if (item.kind === 'area') return formatAreaForUnit(item.squareMeters, item.areaUnit);
  return `Azimuth ${formatAngle(item.bearing)}`;
}

function measurementCopyNumber(item: MeasurementResult) {
  if (item.kind === 'distance') return distanceNumberForUnit(item.meters, item.lengthUnit);
  if (item.kind === 'area') return areaNumberForUnit(item.squareMeters, item.areaUnit);
  return item.bearing.toFixed(2);
}

function arrowIcon(bearing: number) {
  return L.divIcon({
    className: 'direction-arrow-icon',
    html: `<span style="transform: translate(-50%, -50%) rotate(${bearing}deg)"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

async function writeClipboardText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* fallback below */ }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.width = '1px';
  textArea.style.height = '1px';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!copied) throw new Error('copy failed');
}

/** Approximate a Leaflet circle (lng, lat, radius in meters) as a regular polygon
 *  using spherical earth math so shape survives GeoJSON round-trips. */
function circleToPolygon(lng: number, lat: number, radiusMeters: number, steps = 256): Geom {
  const R = 6378137;
  const d = radiusMeters / R;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lng2 = lng1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [ring] } as unknown as Geom;
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

function nextLayerName(currentName: string, text: string) {
  return extractSingleFeatureName(text) || currentName;
}

export function Visualizer({ tab, setTab }: VisualizerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const layerGroupsRef = useRef<Record<string, L.FeatureGroup>>({});
  const measurementGroupRef = useRef<L.FeatureGroup | null>(null);
  const measurementLayersRef = useRef<Record<string, L.Layer>>({});
  const measurementSeqRef = useRef(1);

  const [tileStyle, setTileStyle] = useState<TileStyleId>(TWEAKS_DEFAULTS.tileStyle);
  useContext(ThemeCtx); // consume theme ctx (re-render on theme change handled globally via data-theme on html)
  const [autoRender, setAutoRender] = useState<boolean>(TWEAKS_DEFAULTS.autoRender);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [coord, setCoord] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [tool, setTool] = useState<Tool>('cursor');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementResult[]>([]);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [exportDrawerOpen, setExportDrawerOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'GeoJSON' | 'WKT'>('GeoJSON');
  const [wktExportMode, setWktExportMode] = useState<WktExportMode>('collection');
  const [exportCopied, setExportCopied] = useState(false);
  const [sourceCrs, setSourceCrs] = useState(() => {
    try {
      return localStorage.getItem('geotools.visualizerCrs') || DEFAULT_VISUALIZER_CRS;
    } catch {
      return DEFAULT_VISUALIZER_CRS;
    }
  });
  const [sourceOffset, setSourceOffset] = useState<VisualizerCrsOffset>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('geotools.visualizerOffset') || 'null');
      if (saved && typeof saved === 'object') {
        return {
          enabled: !!saved.enabled,
          x: typeof saved.x === 'string' || typeof saved.x === 'number' ? saved.x : 0,
          y: typeof saved.y === 'string' || typeof saved.y === 'number' ? saved.y : 0,
        };
      }
    } catch { /* ignore */ }
    return DEFAULT_VISUALIZER_OFFSET;
  });
  const numericSourceOffset = useMemo(() => numericCoordinateOffset(sourceOffset), [sourceOffset]);
  const sourceOffsetKey = `${numericSourceOffset.enabled}:${numericSourceOffset.x}:${numericSourceOffset.y}`;

  const layersRef = useRef<Layer[]>([]);
  const toolRef = useRef(tool);

  const [layers, setLayers] = useState<Layer[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('geotools.layers') || 'null');
      if (Array.isArray(saved)) {
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
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => {
    try { localStorage.setItem('geotools.visualizerCrs', sourceCrs); } catch { /* ignore */ }
  }, [sourceCrs]);
  useEffect(() => {
    try { localStorage.setItem('geotools.visualizerOffset', JSON.stringify(sourceOffset)); } catch { /* ignore */ }
  }, [sourceOffset]);

  useEffect(() => {
    const container = mapRef.current?.getContainer();
    if (!container) return;
    container.classList.toggle('map-tool-cursor', tool === 'cursor');
    return () => { container.classList.remove('map-tool-cursor'); };
  }, [tool]);

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
    const sourceGeom = mapGeomToSourceGeom(geom, sourceCrs, numericSourceOffset);

    setLayers((ps) => ps.map((p) => {
      if (p.id !== id) return p;
      if (p.source === 'file') return p;
      const origFormat = p.parseResult && p.parseResult.ok ? p.parseResult.format : 'GeoJSON';
      const text = origFormat === 'WKT' ? stringifyGeom(sourceGeom, 'WKT') : JSON.stringify(sourceGeom, null, 2);
      const parseResult: ParseResult = { ok: true, geom: sourceGeom, format: origFormat };
      return { ...p, text, parseResult };
    }));
  }, [numericSourceOffset, sourceCrs]);

  const handlePmDrag = useCallback((ev: any) => {
    syncDraggedEditMarkers(ev.target);
  }, []);

  const handlePmMutation = useCallback((ev: any) => {
    if (!shouldSyncLayerEdit(ev.type, ev)) return;
    handlePmEdit(ev);
  }, [handlePmEdit]);

  /* Init map */
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [37.7749, -122.4194],
      zoom: 11,
      zoomControl: false,
      zoomSnap: MAP_ZOOM_STEP,
      zoomDelta: MAP_ZOOM_STEP,
      scrollWheelZoom: false,
      worldCopyJump: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    (map as any).pm?.setGlobalOptions({ snappable: true, snapDistance: 15 });
    measurementGroupRef.current = L.featureGroup().addTo(map);
    mapRef.current = map;
    return () => {
      measurementGroupRef.current = null;
      measurementLayersRef.current = {};
      layerGroupsRef.current = {};
      lastRenderedRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* Deselect layer when user clicks empty map background.
     Per-layer click handlers stopPropagation, so this only fires on true background clicks. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMapClick = () => {
      if (tool === 'cursor') setSelectedId(null);
    };
    map.on('click', onMapClick);
    return () => { map.off('click', onMapClick); };
  }, [tool]);

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
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 4,
    }).addTo(map);
  }, [tileStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const container = map.getContainer();
    let locked = false;
    let lockTimer: number | null = null;

    const onWheel = (event: Event) => {
      const wheelEvent = event as WheelEvent;
      L.DomEvent.stop(event);

      if (locked || wheelEvent.deltaY === 0) return;

      locked = true;
      const direction = wheelEvent.deltaY < 0 ? 1 : -1;
      const point = map.mouseEventToContainerPoint(wheelEvent);
      map.setZoomAround(point, map.getZoom() + direction * MAP_ZOOM_STEP);
      lockTimer = window.setTimeout(() => { locked = false; }, WHEEL_ZOOM_LOCK_MS);
    };

    L.DomEvent.on(container, 'wheel', onWheel);
    return () => {
      if (lockTimer !== null) window.clearTimeout(lockTimer);
      L.DomEvent.off(container, 'wheel', onWheel);
    };
  }, []);

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

  /* Persist (debounced so color-picker drags don't thrash localStorage) */
  useEffect(() => {
    const t = setTimeout(() => {
      const toSave = layers.map(({ parseResult: _pr, ...rest }) => rest);
      try {
        localStorage.setItem('geotools.layers', JSON.stringify(toSave));
      } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(t);
  }, [layers]);

  /* Track last-rendered structural signature so color-only changes can skip
     the expensive full rebuild and just restyle existing Leaflet layers. */
  const lastRenderedRef = useRef<{
    id: string;
    parseResult: Layer['parseResult'];
    visible: boolean;
    locked: boolean;
    name: string;
    sourceCrs: string;
    sourceOffsetKey: string;
  }[]>([]);

  const applyLayerStyle = (group: L.FeatureGroup, color: string) => {
    group.eachLayer((l: any) => {
      try {
        if (l instanceof L.CircleMarker) {
          l.setStyle({ fillColor: color, color: '#ffffff' });
        } else if (typeof l.setStyle === 'function') {
          const t = l.feature && l.feature.geometry ? l.feature.geometry.type : '';
          if (typeof t === 'string' && t.includes('Line')) {
            l.setStyle({ color });
          } else {
            l.setStyle({ color, fillColor: color });
          }
        }
      } catch { /* ignore */ }
    });
  };

  /* Render layers whenever they change */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const prev = lastRenderedRef.current;
    const structuralSame =
      prev.length === layers.length &&
      layers.every((p, i) => {
        const q = prev[i];
        return !!q
          && q.id === p.id
          && q.parseResult === p.parseResult
          && q.visible === p.visible
          && q.locked === p.locked
          && q.name === p.name
          && q.sourceCrs === sourceCrs
          && q.sourceOffsetKey === sourceOffsetKey;
      });

    if (structuralSame) {
      // Color-only (or no-op) update — just restyle existing groups.
      layers.forEach((p) => {
        const group = layerGroupsRef.current[p.id];
        if (group) applyLayerStyle(group, p.color);
      });
    } else {
      Object.values(layerGroupsRef.current).forEach((lg) => map.removeLayer(lg));
      layerGroupsRef.current = {};

      layers.forEach((p) => {
        if (p.parseResult && p.parseResult.ok && p.visible !== false) {
          const group = L.featureGroup();
          try {
            const mapGeom = sourceGeomToMapGeom(p.parseResult.geom, sourceCrs, numericSourceOffset);
            addGeomToGroup(group, mapGeom, p.color);
            group.eachLayer((l: any) => {
              l.__layerId = p.id;
              l.__locked = !!p.locked;
              l.on('click', (ev: L.LeafletMouseEvent) => {
                if (toolRef.current !== 'cursor') return;
                L.DomEvent.stopPropagation(ev as any);
                setSelectedId(p.id);
              });
              if (!p.locked) {
                l.on('pm:vertexadded', handlePmMutation);
                l.on('pm:vertexremoved', handlePmMutation);
                l.on('pm:markerdragend', handlePmMutation);
                l.on('pm:drag', handlePmDrag);
                l.on('pm:dragend', handlePmMutation);
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
    }

    lastRenderedRef.current = layers.map((p) => ({
      id: p.id,
      parseResult: p.parseResult,
      visible: p.visible,
      locked: p.locked,
      name: p.name,
      sourceCrs,
      sourceOffsetKey,
    }));
  }, [layers, handlePmDrag, handlePmMutation, numericSourceOffset, sourceCrs, sourceOffsetKey]);

  /* One-shot initial fit: fit the map to all rendered layers the FIRST time any exist,
     so the user sees their data on load. After that we never auto-fit — the current zoom
     is preserved across edits, new layers, toggles, etc. Users can press "Fit all". */
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current) return;
    const t = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      const groups = Object.values(layerGroupsRef.current);
      if (groups.length === 0) return;
      const all = L.featureGroup(groups);
      const b = all.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
        didInitialFit.current = true;
      }
    }, 300);
    return () => clearTimeout(t);
  }, [layers]);

  /* Tool mode (draw / edit) */
  const nextAvailableColor = useCallback(() => {
    const used = new Set(layersRef.current.map((l) => l.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[layersRef.current.length % PALETTE.length];
  }, []);

  const showToast = useCallback((msg: string, err?: boolean) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2200);
  }, []);

  const copyMeasurementText = useCallback(async (text: string) => {
    try {
      await writeClipboardText(text);
      showToast('Copied measurement');
    } catch {
      showToast('Copy failed', true);
    }
  }, [showToast]);

  const addMeasurementFromPoints = useCallback((
    toolName: MeasurementTool,
    latLngs: L.LatLng[],
    overlay: L.Layer,
  ) => {
    const group = measurementGroupRef.current;
    if (!group) return;

    if (latLngs.length < 2 || (toolName === 'measure-area' && latLngs.length < 3)) {
      showToast('Measurement needs more points', true);
      return;
    }

    const id = `m${measurementSeqRef.current++}`;
    const index = measurementSeqRef.current - 1;
    let result: MeasurementResult;

    if (toolName === 'measure-distance') {
      const meters = pathDistance(latLngs);
      result = {
        id,
        kind: 'distance',
        title: `Distance ${index}`,
        meters,
        pointCount: latLngs.length,
        lengthUnit: 'm',
      };
    } else if (toolName === 'measure-area') {
      const squareMeters = polygonArea(latLngs);
      result = {
        id,
        kind: 'area',
        title: `Area ${index}`,
        squareMeters,
        perimeterMeters: pathDistance([...latLngs, latLngs[0]]),
        areaUnit: 'm2',
        perimeterUnit: 'm',
      };
    } else {
      const start = latLngs[0];
      const end = latLngs[latLngs.length - 1];
      const bearing = bearingDegrees(start, end);
      const cardinals = [
        ['E', 90],
        ['S', 180],
        ['W', 270],
        ['N', 0],
      ] as const;
      result = {
        id,
        kind: 'direction',
        title: `Direction ${index}`,
        bearing,
        meters: start.distanceTo(end),
        lengthUnit: 'm',
        angles: cardinals.map(([label, degrees]) => ({
          label,
          degrees: angleBetweenDegrees(bearing, degrees),
        })),
      };
    }

    overlay.bindTooltip(`${result.title}: ${measurementPrimary(result)}`, {
      permanent: false,
      direction: 'top',
      className: 'geo-tip measure-tip',
      sticky: true,
    });
    overlay.addTo(group);
    measurementLayersRef.current[id] = overlay;
    setMeasurements((items) => [result, ...items]);
  }, [showToast]);

  const addMeasurement = useCallback((toolName: MeasurementTool, layer: MeasurementLayer) => {
    const latLngs = flattenLatLngs(layer.getLatLngs?.());

    if (typeof layer.setStyle === 'function') {
      layer.setStyle({
        color: MEASURE_COLOR,
        weight: 2.5,
        fillColor: MEASURE_COLOR,
        fillOpacity: toolName === 'measure-area' ? 0.16 : 0.05,
      });
    }

    addMeasurementFromPoints(toolName, latLngs, layer);
  }, [addMeasurementFromPoints]);

  const clearMeasurements = useCallback(() => {
    measurementGroupRef.current?.clearLayers();
    measurementLayersRef.current = {};
    measurementSeqRef.current = 1;
    setMeasurements([]);
  }, []);

  const removeMeasurement = useCallback((id: string) => {
    const layer = measurementLayersRef.current[id];
    if (layer) measurementGroupRef.current?.removeLayer(layer);
    delete measurementLayersRef.current[id];
    setMeasurements((items) => items.filter((item) => item.id !== id));
  }, []);

  const updateMeasurement = useCallback((id: string, update: Partial<MeasurementResult>) => {
    setMeasurements((items) => items.map((item) => (
      item.id === id ? ({ ...item, ...update } as MeasurementResult) : item
    )));
  }, []);

  useEffect(() => {
    const map = mapRef.current as any;
    if (!map || !map.pm) return;

    const disablePmModes = () => {
      if (map.pm.globalDrawModeEnabled?.()) map.pm.disableDraw();
      if (map.pm.globalEditModeEnabled?.()) map.pm.disableGlobalEditMode();
      if (map.pm.globalDragModeEnabled?.()) map.pm.disableGlobalDragMode();
    };

    disablePmModes();
    Object.values(layerGroupsRef.current).forEach((group) => {
      group.eachLayer((l: any) => {
        try { l.pm?.disable(); } catch { /* ignore */ }
      });
    });

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

    const measureStyle = () => ({
      pathOptions: { color: MEASURE_COLOR, weight: 2.5, fillColor: MEASURE_COLOR, fillOpacity: 0.16 },
      templineStyle: { color: MEASURE_COLOR },
      hintlineStyle: { color: MEASURE_COLOR, dashArray: '5,5' },
      markerStyle: { icon: pointIcon(MEASURE_COLOR) },
      continueDrawing: false,
    });

    if (tool === 'cursor') {
      // Enable vertex editing and whole-layer dragging only on the selected, unlocked
      // layer. `syncLayersOnDrag: true` keeps sibling features in the same FeatureGroup
      // moving together, so points no longer lag behind the dragged geometry.
      if (selectedId) {
        const group = layerGroupsRef.current[selectedId];
        const lyr = layersRef.current.find((l) => l.id === selectedId);
        if (group && lyr && !lyr.locked) {
          group.eachLayer((l: any) => {
            l.options.pmIgnore = false;
            try { l.pm?.enableLayerDrag?.(); } catch { /* ignore */ }
            try { l.pm?.enable(buildLayerEditOptions()); } catch { /* ignore */ }
          });
        }
      }
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
    } else if (tool === 'circle') {
      map.pm.enableDraw('Circle', pmStyle());
    } else if (tool === 'measure-distance') {
      map.pm.enableDraw('Line', measureStyle());
    } else if (tool === 'measure-area') {
      map.pm.enableDraw('Polygon', measureStyle());
    }

    return () => {
      disablePmModes();
    };
  }, [tool, selectedId, layers, nextAvailableColor]);

  useEffect(() => {
    const map = mapRef.current;
    const group = measurementGroupRef.current;
    if (tool !== 'direction' || !map || !group) return;

    let start: L.LatLng | null = null;
    let preview: L.FeatureGroup | null = null;
    let line: L.Polyline | null = null;
    let arrow: L.Marker | null = null;

    const clearPreview = () => {
      if (preview) group.removeLayer(preview);
      preview = null;
      line = null;
      arrow = null;
    };

    const updatePreview = (end: L.LatLng) => {
      if (!start) return;
      const bearing = bearingDegrees(start, end);
      if (!preview) {
        line = L.polyline([start, end], {
          color: MEASURE_COLOR,
          weight: 2.5,
          dashArray: '6 6',
          interactive: false,
        });
        arrow = L.marker(end, {
          interactive: false,
          icon: arrowIcon(bearing),
        });
        preview = L.featureGroup([line, arrow]).addTo(group);
      } else {
        line?.setLatLngs([start, end]);
        arrow?.setLatLng(end);
        arrow?.setIcon(arrowIcon(bearing));
      }
    };

    const onClick = (event: L.LeafletMouseEvent) => {
      if (!start) {
        start = event.latlng;
        updatePreview(event.latlng);
        return;
      }

      const end = event.latlng;
      if (start.distanceTo(end) < 0.01) return;
      const bearing = bearingDegrees(start, end);
      const finalLine = L.polyline([start, end], {
        color: MEASURE_COLOR,
        weight: 2.5,
        dashArray: '6 6',
      });
      const finalArrow = L.marker(end, {
        interactive: false,
        icon: arrowIcon(bearing),
      });
      const finalRay = L.featureGroup([finalLine, finalArrow]);
      clearPreview();
      addMeasurementFromPoints('direction', [start, end], finalRay);
      setTool('cursor');
    };

    const onMouseMove = (event: L.LeafletMouseEvent) => {
      if (start) updatePreview(event.latlng);
    };

    map.getContainer().classList.add('direction-tool-active');
    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.getContainer().classList.remove('direction-tool-active');
      clearPreview();
    };
  }, [tool, addMeasurementFromPoints]);

  /* Geoman create handler */
  const addDrawnLayer = useCallback((geom: Geom, shape?: string) => {
    const idx = layersRef.current.length;
    const used = new Set(layersRef.current.map((l) => l.color));
    const color = PALETTE.find((c) => !used.has(c)) || PALETTE[idx % PALETTE.length];
    const sourceGeom = mapGeomToSourceGeom(geom, sourceCrs, numericSourceOffset);
    const name = drawnLayerName(idx, sourceGeom.type, shape);
    const text = JSON.stringify(sourceGeom, null, 2);
    const newLayer: Layer = {
      id: Math.random().toString(36).slice(2, 9),
      name, text, color,
      visible: true, locked: false, source: 'drawn',
      parseResult: { ok: true, geom: sourceGeom, format: 'GeoJSON' },
    };
    setLayers((ps) => [...ps, newLayer]);
    setSelectedId(newLayer.id);
    showToast(`Created ${sourceGeom.type} as new layer`);
  }, [numericSourceOffset, showToast, sourceCrs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onCreate = (e: any) => {
      const layer = e.layer;
      const activeTool = toolRef.current;
      if (isMeasurementTool(activeTool)) {
        map.removeLayer(layer);
        addMeasurement(activeTool, layer);
        setTool('cursor');
        return;
      }

      let geom: Geom | null = null;
      // L.Circle is not GeoJSON-native — approximate as a 256-sided polygon so it
      // round-trips through GeoJSON/WKT and can be vertex-edited like any polygon.
      if (e.shape === 'Circle' || layer instanceof L.Circle) {
        const c = layer.getLatLng();
        const r = layer.getRadius();
        geom = circleToPolygon(c.lng, c.lat, r, 256);
      } else {
        let gj: any;
        try { gj = layer.toGeoJSON(); } catch { return; }
        geom = gj.geometry || gj;
      }
      if (!geom) return;
      map.removeLayer(layer);
      addDrawnLayer(geom, e.shape);
      setTool('cursor');
    };
    (map as any).on('pm:create', onCreate);
    return () => {
      (map as any).off('pm:create', onCreate);
    };
  }, [addDrawnLayer, addMeasurement]);

  /* Layer actions — wrapped in useCallback so memoized LayerPanel children
     don't re-render on unrelated state changes (e.g. color-picker drags). */
  const autoRenderRef = useRef(autoRender);
  useEffect(() => { autoRenderRef.current = autoRender; }, [autoRender]);

  const updateText = useCallback((id: string, text: string) => {
    setLayers((ps) => ps.map((p) => (p.id === id ? {
      ...p,
      name: nextLayerName(p.name, text),
      text,
      source: null,
      parseResult: autoRenderRef.current ? parseGeometry(text) : p.parseResult,
    } : p)));
  }, []);
  const manualRender = useCallback((id: string) => {
    setLayers((ps) => ps.map((p) => (p.id === id ? {
      ...p,
      name: nextLayerName(p.name, p.text),
      parseResult: parseGeometry(p.text),
    } : p)));
  }, []);
  const addLayer = useCallback((preset?: keyof typeof SAMPLES) => {
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
  }, []);
  const removeLayer = useCallback((id: string) => {
    setLayers((ps) => ps.filter((p) => p.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, []);
  const renameLayer = useCallback((id: string, name: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p))), []);
  const clearLayer = useCallback((id: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, text: '', parseResult: null, source: null } : p))), []);
  const toggleVisible = useCallback((id: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p))), []);
  const toggleLock = useCallback((id: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, locked: !p.locked } : p))), []);
  const recolorLayer = useCallback((id: string, color: string) =>
    setLayers((ps) => ps.map((p) => (p.id === id ? { ...p, color } : p))), []);

  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((m) => ({ ...m, [id]: !m[id] }));
  }, []);
  // Auto-expand the selected layer's panel so entering edit mode always reveals its input.
  useEffect(() => {
    if (!selectedId) return;
    setCollapsedIds((m) => (m[selectedId] ? { ...m, [selectedId]: false } : m));
  }, [selectedId]);
  const allCollapsed = layers.length > 0 && layers.every((p) => collapsedIds[p.id]);
  const setAllCollapsed = (v: boolean) => {
    setCollapsedIds(v ? Object.fromEntries(layers.map((p) => [p.id, true])) : {});
  };

  const handleUpload = useCallback(async (id: string, file: File) => {
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
        name: extractSingleFeatureName(text)
          || (p.name.startsWith('Geometry') ? file.name.replace(/\.[^.]+$/, '') : p.name),
      } : p)));
      showToast(`Loaded ${file.name}`);
    } catch (e: any) {
      showToast(`Read error: ${e.message}`, true);
    }
  }, [showToast]);

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

  const clearAll = () => {
    setLayers((ps) => ps.filter((p) => p.locked));
    setSelectedId((id) => {
      if (!id) return id;
      const keep = layersRef.current.find((p) => p.id === id && p.locked);
      return keep ? id : null;
    });
  };

  useEffect(() => {
    if (autoRender) {
      setLayers((ps) => ps.map((p) => ({
        ...p,
        name: nextLayerName(p.name, p.text),
        parseResult: parseGeometry(p.text),
      })));
    }
  }, [autoRender]);

  /* Derived */
  const renderedCount = layers.filter((p) => p.parseResult && p.parseResult.ok).length;
  const exportableCount = renderedCount;
  const crsLabel = `${crsShort(sourceCrs)}${numericSourceOffset.enabled ? ' offset' : ''}`;
  const exportText = useMemo(() => {
    if (exportFormat === 'GeoJSON') return buildAllLayersGeoJsonExport(layers);
    return buildAllLayersWktExport(layers, wktExportMode);
  }, [exportFormat, layers, wktExportMode]);
  const exportHint = exportFormat === 'GeoJSON'
    ? `FeatureCollection export uses ${crsLabel} coordinates and preserves single-feature properties.`
    : wktExportMode === 'collection'
      ? `Standard WKT export uses ${crsLabel} coordinates in a single GEOMETRYCOLLECTION.`
      : `Layered WKT export uses ${crsLabel} coordinates.`;

  const coordDisplay = useMemo(() => {
    if (!coord) return null;
    try {
      const [x, y] = mapCoordToSourceCoord([coord.lng, coord.lat], sourceCrs, numericSourceOffset);
      if (isProjectedDisplayCrs(sourceCrs)) {
        return {
          a: [isUtmCrs(sourceCrs) ? 'E' : 'x', `${x.toFixed(1)}m`],
          b: [isUtmCrs(sourceCrs) ? 'N' : 'y', `${y.toFixed(1)}m`],
        };
      }
      return { a: ['lat', y.toFixed(5)], b: ['lng', x.toFixed(5)] };
    } catch {
      return { a: ['lat', coord.lat.toFixed(5)], b: ['lng', coord.lng.toFixed(5)] };
    }
  }, [coord, numericSourceOffset, sourceCrs]);

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

  /* Sidebar resize — drag the right edge of the layers pane to widen it.
     420px is the minimum (current design baseline); max is 60% viewport. */
  const SIDE_MIN = 420;
  const [sideWidth, setSideWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('geotools.sideWidth'));
    return Number.isFinite(saved) && saved >= SIDE_MIN ? saved : SIDE_MIN;
  });
  useEffect(() => {
    try { localStorage.setItem('geotools.sideWidth', String(sideWidth)); } catch { /* ignore */ }
  }, [sideWidth]);
  useEffect(() => {
    // Let Leaflet recompute its canvas whenever the pane width changes.
    mapRef.current?.invalidateSize();
  }, [sideWidth]);

  const startSideResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideWidth;
    const maxW = Math.max(SIDE_MIN, Math.floor(window.innerWidth * 0.6));
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(maxW, Math.max(SIDE_MIN, startW + (ev.clientX - startX)));
      setSideWidth(w);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <>
      <AppShell tab={tab} setTab={setTab} />

      <div className="split" style={{ gridTemplateColumns: `${sideWidth}px 1fr` }}>
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
                          name: extractSingleFeatureName(text) || f.name.replace(/\.[^.]+$/, ''),
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
              <button
                className={`btn sm ghost side-collapse-toggle ${allCollapsed ? 'collapsed' : ''}`}
                title={allCollapsed ? 'Expand all' : 'Collapse all'}
                onClick={() => setAllCollapsed(!allCollapsed)}
                disabled={layers.length === 0}
              >
                <span className="side-collapse-icon">
                  <Icon name="chevron" size={11} />
                </span>
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
              <button className="btn sm ghost" onClick={clearAll}>
                <Icon name="trash" size={11} />
                Clear all
              </button>
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
                    <button onClick={() => { setTool('circle'); setAddMenuOpen(false); }}>
                      <Icon name="circle" size={12} /> Draw circle
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="side-crs-panel">
            <div className="side-crs-head">
              <span>Layer CRS</span>
              <label className="crs-origin-toggle">
                <input
                  type="checkbox"
                  checked={sourceOffset.enabled}
                  onChange={(event) => setSourceOffset((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))}
                />
                <span>Offset</span>
              </label>
            </div>
            <CrsSelect value={sourceCrs} onChange={setSourceCrs} />
            {sourceOffset.enabled && (
              <div className="visualizer-offset-grid">
                <label>
                  <span>X / Easting</span>
                  <input
                    type="number"
                    value={sourceOffset.x}
                    onChange={(event) => setSourceOffset((current) => ({
                      ...current,
                      x: event.target.value,
                    }))}
                    step="0.0001"
                  />
                </label>
                <label>
                  <span>Y / Northing</span>
                  <input
                    type="number"
                    value={sourceOffset.y}
                    onChange={(event) => setSourceOffset((current) => ({
                      ...current,
                      y: event.target.value,
                    }))}
                    step="0.0001"
                  />
                </label>
              </div>
            )}
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
                onRecolor={recolorLayer}
                palette={PALETTE}
                autoRender={autoRender}
                collapsed={!!collapsedIds[p.id]}
                onToggleCollapsed={toggleCollapsed}
              />
            ))}
            <button className="add-panel" onClick={() => addLayer()}>
              <Icon name="plus" size={14} /> Add layer
            </button>
          </div>
          <div
            className="side-resizer"
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize"
            onPointerDown={startSideResize}
            onDoubleClick={() => setSideWidth(SIDE_MIN)}
          />
        </aside>

        <div className="map-wrap">
          <div className="map-toolbar">
            <div className="tool-group" aria-label="Edit tools">
              <button className={`tool-btn ${tool === 'cursor' ? 'active' : ''}`} onClick={() => setTool('cursor')} title="Cursor (select/edit)">
                <Icon name="cursor" size={12} />
                <span className="tool-btn-label">Cursor</span>
              </button>
            </div>

            <div className="tool-group" aria-label="Draw tools">
              <button className={`tool-btn ${tool === 'point' ? 'active' : ''}`} onClick={() => setTool('point')} title="Draw point">
                <Icon name="point" size={12} />
                <span className="tool-btn-label">Point</span>
              </button>
              <button className={`tool-btn ${tool === 'line' ? 'active' : ''}`} onClick={() => setTool('line')} title="Draw line">
                <Icon name="line" size={12} />
                <span className="tool-btn-label">Line</span>
              </button>
              <button className={`tool-btn ${tool === 'polygon' ? 'active' : ''}`} onClick={() => setTool('polygon')} title="Draw polygon">
                <Icon name="polygon" size={12} />
                <span className="tool-btn-label">Polygon</span>
              </button>
              <button className={`tool-btn ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} title="Draw rectangle">
                <Icon name="rect" size={12} />
                <span className="tool-btn-label">Rectangle</span>
              </button>
              <button className={`tool-btn ${tool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle')} title="Draw circle">
                <Icon name="circle" size={12} />
                <span className="tool-btn-label">Circle</span>
              </button>
            </div>

            <div className="tool-group operation-tools" aria-label="Measure tools">
              <button
                className={`tool-btn ${tool === 'measure-distance' ? 'active' : ''}`}
                onClick={() => setTool('measure-distance')}
                title="Measure distance"
              >
                <Icon name="ruler" size={12} />
                <span className="tool-btn-label">Distance</span>
              </button>
              <button
                className={`tool-btn ${tool === 'measure-area' ? 'active' : ''}`}
                onClick={() => setTool('measure-area')}
                title="Measure area"
              >
                <Icon name="area" size={12} />
                <span className="tool-btn-label">Area</span>
              </button>
              <button
                className={`tool-btn ${tool === 'direction' ? 'active' : ''}`}
                onClick={() => setTool('direction')}
                title="Draw direction ray"
              >
                <Icon name="compass" size={12} />
                <span className="tool-btn-label">Direction</span>
              </button>
            </div>
            <span className="tool-hint">
              {tool === 'cursor' && 'Click a geometry to edit vertices. Drag to move.'}
              {tool === 'point' && 'Click map to place a point'}
              {tool === 'line' && 'Click to add vertices · double-click to finish'}
              {tool === 'polygon' && 'Click to add vertices · double-click to finish'}
              {tool === 'rect' && 'Click + drag to draw a rectangle'}
              {tool === 'circle' && 'Click center, drag to set radius'}
              {tool === 'measure-distance' && 'Click line vertices · double-click to finish distance'}
              {tool === 'measure-area' && 'Click polygon vertices · double-click to finish area'}
              {tool === 'direction' && 'Click start · move to preview ray · click end'}
            </span>
          </div>

          <div className="map-inner">
            <div id="map" ref={mapContainerRef} />

            <div className="map-overlay-tl">
              <Legend
                layers={layers}
                selectedId={selectedId}
                onToggle={toggleVisible}
                onZoomTo={zoomTo}
                onSelect={(id) => { setSelectedId(id); setTool('cursor'); }}
                onRemove={removeLayer}
                crsLabel={crsLabel}
              />
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

            {measurements.length > 0 && (
              <div className="map-overlay-measure">
                <div className="measure-panel">
                  <div className="measure-panel-head">
                    <span>Measurements</span>
                    <div className="measure-panel-actions">
                      <button className="legend-act danger" onClick={clearMeasurements} title="Clear measurements">
                        <Icon name="trash" size={11} />
                      </button>
                    </div>
                  </div>
                  <div className="measure-list">
                    {measurements.map((item) => (
                      <div
                        className={`measure-item ${item.kind}`}
                        key={item.id}
                      >
                        <div className="measure-item-main">
                          <span>{item.title}</span>
                          <button
                            className="measure-primary-copy"
                            type="button"
                            title="Copy value"
                            onClick={() => copyMeasurementText(measurementCopyNumber(item))}
                          >
                            {measurementPrimary(item)}
                          </button>
                          <button
                            className="measure-delete"
                            type="button"
                            title="Delete result"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeMeasurement(item.id);
                            }}
                          >
                            <Icon name="x" size={10} />
                          </button>
                        </div>
                        {item.kind === 'distance' && (
                          <>
                            <div className="measure-unit-row">
                              {LENGTH_UNITS.map((unit) => (
                                <button
                                  key={unit.id}
                                  type="button"
                                  className={item.lengthUnit === unit.id ? 'active' : ''}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateMeasurement(item.id, { lengthUnit: unit.id });
                                  }}
                                >
                                  {unit.label}
                                </button>
                              ))}
                            </div>
                            <div className="measure-item-details">
                              <span>{item.pointCount} points</span>
                              <span>{item.meters.toFixed(2)} m raw</span>
                            </div>
                          </>
                        )}
                        {item.kind === 'area' && (
                          <>
                            <div className="measure-unit-row">
                              {AREA_UNITS.map((unit) => (
                                <button
                                  key={unit.id}
                                  type="button"
                                  className={item.areaUnit === unit.id ? 'active' : ''}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateMeasurement(item.id, { areaUnit: unit.id });
                                  }}
                                >
                                  {unit.label}
                                </button>
                              ))}
                            </div>
                            <div className="measure-unit-row secondary">
                              {LENGTH_UNITS.map((unit) => (
                                <button
                                  key={unit.id}
                                  type="button"
                                  className={item.perimeterUnit === unit.id ? 'active' : ''}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateMeasurement(item.id, { perimeterUnit: unit.id });
                                  }}
                                >
                                  {unit.label}
                                </button>
                              ))}
                            </div>
                            <div className="measure-item-details">
                              <span>Perimeter {formatDistanceForUnit(item.perimeterMeters, item.perimeterUnit)}</span>
                              <span>{item.squareMeters.toFixed(2)} m² raw</span>
                            </div>
                          </>
                        )}
                        {item.kind === 'direction' && (
                          <>
                            <div className="measure-unit-row">
                              {LENGTH_UNITS.map((unit) => (
                                <button
                                  key={unit.id}
                                  type="button"
                                  className={item.lengthUnit === unit.id ? 'active' : ''}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateMeasurement(item.id, { lengthUnit: unit.id });
                                  }}
                                >
                                  {unit.label}
                                </button>
                              ))}
                            </div>
                            <div className="measure-item-details">
                              <span>Length {formatDistanceForUnit(item.meters, item.lengthUnit)}</span>
                            </div>
                            <div className="measure-angle-list">
                              {item.angles.map((angle) => (
                                <button
                                  key={angle.label}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    copyMeasurementText(`${angle.degrees.toFixed(2)}\t${((angle.degrees * Math.PI) / 180).toFixed(4)}`);
                                  }}
                                  title={`Copy ${angle.label} angle`}
                                >
                                  <span>{angle.label}</span>
                                  <strong>{angle.degrees.toFixed(2)}°</strong>
                                  <code>{((angle.degrees * Math.PI) / 180).toFixed(4)} rad</code>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

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

          <div className={`export-drawer ${exportDrawerOpen ? 'open' : ''}`}>
            <button
              type="button"
              className="export-drawer-handle"
              onClick={() => setExportDrawerOpen((v) => !v)}
              aria-expanded={exportDrawerOpen}
            >
              <span className="export-drawer-handle-main">
                <Icon name="file" size={12} />
                All Layers Export
              </span>
              <span className="export-drawer-handle-meta">
                {exportableCount}/{layers.length} exportable
              </span>
              <span className={`export-drawer-chevron ${exportDrawerOpen ? 'open' : ''}`}>
                <Icon name="chevron" size={11} />
              </span>
            </button>
            <div className="export-drawer-body">
              <div className="export-drawer-toolbar">
                <div className="export-drawer-groups">
                  <div className="drawer-opt">
                    <button
                      className={exportFormat === 'GeoJSON' ? 'active' : ''}
                      onClick={() => setExportFormat('GeoJSON')}
                    >
                      GeoJSON
                    </button>
                    <button
                      className={exportFormat === 'WKT' ? 'active' : ''}
                      onClick={() => setExportFormat('WKT')}
                    >
                      WKT
                    </button>
                  </div>
                  {exportFormat === 'WKT' && (
                    <div className="drawer-opt">
                      <button
                        className={wktExportMode === 'collection' ? 'active' : ''}
                        onClick={() => setWktExportMode('collection')}
                      >
                        Standard
                      </button>
                      <button
                        className={wktExportMode === 'layered' ? 'active' : ''}
                        onClick={() => setWktExportMode('layered')}
                      >
                        Layered
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="btn sm ghost"
                  disabled={!exportText.trim()}
                  onClick={async () => {
                    if (!exportText.trim()) return;
                    try {
                      await navigator.clipboard.writeText(exportText);
                      setExportCopied(true);
                      setTimeout(() => setExportCopied(false), 1200);
                      showToast(`Copied all layers as ${exportFormat}`);
                    } catch {
                      showToast('Copy failed', true);
                    }
                  }}
                >
                  <Icon name={exportCopied ? 'check' : 'copy'} size={11} />
                  {exportCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                className="export-drawer-output"
                value={exportText}
                readOnly
                spellCheck={false}
              />
              <div className="export-drawer-hint">{exportHint}</div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  );
}
