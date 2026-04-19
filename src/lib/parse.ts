import wellknown from 'wellknown';
import type { GeoJSONGeometry } from 'wellknown';

export type Geom = GeoJSONGeometry | {
  type: 'GeometryCollection';
  geometries: GeoJSONGeometry[];
};

export type ParseResult =
  | { ok: true; geom: Geom; format: 'GeoJSON' | 'WKT' }
  | { ok: false; empty?: boolean; error?: string };

const SUPPORTED = new Set([
  'Point', 'LineString', 'Polygon',
  'MultiPoint', 'MultiLineString', 'MultiPolygon',
  'GeometryCollection',
]);

function cleanErr(msg: string): string {
  if (!msg) return 'Parse error';
  return msg
    .replace(/^JSON\.parse:\s*/i, '')
    .replace(/^Unexpected token .*? in JSON at position/, 'Invalid JSON at position');
}

function extractGeom(obj: any): Geom | null {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    const geoms = obj.features.map((f: any) => f.geometry).filter(Boolean);
    if (geoms.length === 0) return null;
    if (geoms.length === 1) return geoms[0];
    return { type: 'GeometryCollection', geometries: geoms };
  }
  if (obj.type === 'Feature') return obj.geometry || null;
  if (obj.type && obj.coordinates !== undefined) return obj;
  if (obj.type === 'GeometryCollection') return obj;
  return null;
}

function validateGeom(geom: any): void {
  if (!geom || !geom.type) throw new Error('Missing geometry type');
  if (!SUPPORTED.has(geom.type)) throw new Error(`Unsupported type: ${geom.type}`);
  if (geom.type === 'GeometryCollection') {
    if (!Array.isArray(geom.geometries)) throw new Error('GeometryCollection missing .geometries');
    geom.geometries.forEach(validateGeom);
    return;
  }
  if (!Array.isArray(geom.coordinates)) throw new Error('Missing coordinates');
}

export function extractSingleFeatureName(text: string): string | null {
  const t = (text || '').trim();
  if (!t || (!t.startsWith('{') && !t.startsWith('['))) return null;
  try {
    const obj = JSON.parse(t);
    if (obj?.type !== 'Feature') return null;
    const name = obj?.properties?.name;
    if (typeof name !== 'string') return null;
    const trimmed = name.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export function extractSingleFeatureProperties(text: string): Record<string, unknown> | null {
  const t = (text || '').trim();
  if (!t || (!t.startsWith('{') && !t.startsWith('['))) return null;
  try {
    const obj = JSON.parse(t);
    if (obj?.type !== 'Feature') return null;
    const properties = obj?.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
    return { ...properties };
  } catch {
    return null;
  }
}

export function parseGeometry(text: string): ParseResult {
  const t = (text || '').trim();
  if (!t) return { ok: false, empty: true };
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const obj = JSON.parse(t);
      const geom = extractGeom(obj);
      if (!geom) return { ok: false, error: 'No geometry found in JSON' };
      validateGeom(geom);
      return { ok: true, geom, format: 'GeoJSON' };
    } catch (e: any) {
      return { ok: false, error: cleanErr(e.message) };
    }
  }
  try {
    const geom = wellknown.parse(t) as Geom | null;
    if (!geom) return { ok: false, error: 'Invalid WKT syntax' };
    validateGeom(geom);
    return { ok: true, geom, format: 'WKT' };
  } catch (e: any) {
    return { ok: false, error: cleanErr(e.message) };
  }
}

export function stringifyGeom(geom: Geom | null, format: 'GeoJSON' | 'WKT'): string {
  if (!geom) return '';
  if (format === 'WKT') {
    try {
      return wellknown.stringify(geom as any);
    } catch {
      /* fall through */
    }
  }
  return JSON.stringify(geom, null, 2);
}

export interface GeomStats {
  vertices: number;
  type: string;
}

export function geomStats(geom: Geom | null | undefined): GeomStats | null {
  if (!geom) return null;
  let vertices = 0;
  const walk = (c: any): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      vertices++;
      return;
    }
    c.forEach(walk);
  };
  if (geom.type === 'GeometryCollection') {
    (geom as any).geometries.forEach((g: Geom) => {
      const s = geomStats(g);
      if (s) vertices += s.vertices;
    });
    return { vertices, type: `${(geom as any).geometries.length} parts` };
  }
  walk((geom as any).coordinates);
  return { vertices, type: geom.type };
}

/** Transform every coord in a geometry with the given fn. */
export function transformGeom(geom: Geom, xform: (c: number[]) => number[]): Geom {
  if (!geom) return geom;
  if (geom.type === 'GeometryCollection') {
    return {
      ...geom,
      geometries: (geom as any).geometries.map((g: Geom) => transformGeom(g, xform)),
    } as Geom;
  }
  const walk = (c: any): any => {
    if (!Array.isArray(c)) return c;
    if (typeof c[0] === 'number') return xform(c);
    return c.map(walk);
  };
  return { ...(geom as any), coordinates: walk((geom as any).coordinates) } as Geom;
}
