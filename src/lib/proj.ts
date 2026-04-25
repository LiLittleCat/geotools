import proj4 from 'proj4';

const PI = Math.PI;
const X_PI = PI * 3000.0 / 180.0;
const A = 6378245.0;
const EE = 0.006693421622965943;

export function utmProjString(zone: number, hemi: 'N' | 'S'): string {
  const south = hemi === 'S' ? ' +south' : '';
  return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`;
}

function isLngLatAlias(crs: string | null): boolean {
  return crs === 'WGS84' || crs === 'EPSG:4326' || crs === 'EPSG:4490' || crs === 'CGCS2000';
}

/** coord is [lng, lat] in WGS84; toProj is a proj4 definition; returns [x,y] in meters. */
export function projectCoord(coord: number[], toProj: string): number[] {
  if (isLngLatAlias(toProj)) return coord;
  try {
    const [x, y] = proj4('WGS84', toProj, [coord[0], coord[1]]);
    return [x, y];
  } catch {
    return coord;
  }
}

export function unprojectCoord(xy: number[], fromProj: string): number[] {
  if (isLngLatAlias(fromProj)) return xy;
  try {
    const [lng, lat] = proj4(fromProj, 'WGS84', [xy[0], xy[1]]);
    return [lng, lat];
  } catch {
    return xy;
  }
}

export interface CrsPreset {
  id: string;
  label: string;
  proj: string;
}

export const CRS_PRESETS_COMMON: CrsPreset[] = [
  { id: 'EPSG:4326', label: 'WGS84 (lng/lat)', proj: 'WGS84' },
  { id: 'EPSG:3857', label: 'Web Mercator', proj: 'EPSG:3857' },
];

export const CRS_PRESETS_CHINA: CrsPreset[] = [
  { id: 'EPSG:4490', label: 'CGCS2000 (lng/lat)', proj: 'CGCS2000' },
  { id: 'GCJ-02', label: 'China encrypted lng/lat', proj: 'GCJ-02' },
  { id: 'BD-09', label: 'Baidu lng/lat', proj: 'BD-09' },
];

export const CRS_PRESETS_REGIONAL: CrsPreset[] = [
  { id: 'EPSG:32649', label: 'UTM Zone 49N', proj: '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs' },
  { id: 'EPSG:32650', label: 'UTM Zone 50N', proj: '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs' },
  { id: 'EPSG:32651', label: 'UTM Zone 51N', proj: '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs' },
];

export const CRS_PRESETS: CrsPreset[] = [
  ...CRS_PRESETS_COMMON,
  ...CRS_PRESETS_CHINA,
  ...CRS_PRESETS_REGIONAL,
];

export const CRS_PRESETS_UTM_NS: CrsPreset[] = (() => {
  const out: CrsPreset[] = [];
  for (let z = 1; z <= 60; z++)
    out.push({ id: `EPSG:${32600 + z}`, label: `UTM Zone ${z}N`, proj: `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs` });
  for (let z = 1; z <= 60; z++)
    out.push({ id: `EPSG:${32700 + z}`, label: `UTM Zone ${z}S`, proj: `+proj=utm +zone=${z} +south +datum=WGS84 +units=m +no_defs` });
  return out;
})();

export function resolveCrs(id: string): string | null {
  const legacyUtm = id.match(/^UTM(\d{1,2})([NS])$/i);
  if (legacyUtm) {
    const zone = Number(legacyUtm[1]);
    const hemi = legacyUtm[2].toUpperCase();
    if (zone >= 1 && zone <= 60) {
      const epsg = hemi === 'S' ? `EPSG:${32700 + zone}` : `EPSG:${32600 + zone}`;
      const preset = CRS_PRESETS_UTM_NS.find((x) => x.id === epsg);
      if (preset) return preset.proj;
    }
  }

  const p =
    CRS_PRESETS.find((x) => x.id === id) ||
    CRS_PRESETS_UTM_NS.find((x) => x.id === id || x.proj === id);
  return p ? p.proj : id || null;
}

export function isUtmCrs(id: string): boolean {
  if (!id) return false;
  if (typeof id === 'string' && /\+proj=utm/i.test(id)) return true;
  if (/^UTM\d{1,2}[NS]$/i.test(id)) return true;
  return CRS_PRESETS_UTM_NS.some((x) => x.id === id || x.proj === id);
}

export function crsShort(id: string): string {
  if (!id) return '';
  const legacyUtm = id.match(/^UTM(\d{1,2})([NS])$/i);
  if (legacyUtm) {
    const zone = Number(legacyUtm[1]);
    const hemi = legacyUtm[2].toUpperCase();
    if (zone >= 1 && zone <= 60) return hemi === 'S' ? `EPSG:${32700 + zone}` : `EPSG:${32600 + zone}`;
  }
  if (typeof id === 'string' && /\+proj=utm/i.test(id)) {
    const z = id.match(/\+zone=(\d+)/i);
    const s = /\+south\b/i.test(id);
    return z ? `EPSG:${(s ? 32700 : 32600) + Number(z[1])}` : 'UTM';
  }
  const p =
    CRS_PRESETS.find((x) => x.id === id) ||
    CRS_PRESETS_UTM_NS.find((x) => x.id === id || x.proj === id);
  return p ? p.id : id;
}

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

function delta(lng: number, lat: number): [number, number] {
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [dLng, dLat];
}

function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  const [dLng, dLat] = delta(lng, lat);
  return [lng + dLng, lat + dLat];
}

function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  const [dLng, dLat] = delta(lng, lat);
  return [lng - dLng, lat - dLat];
}

function gcj02ToBd09(lng: number, lat: number): [number, number] {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

function bd09ToGcj02(lng: number, lat: number): [number, number] {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

function isGcj02(crs: string | null): boolean {
  return crs === 'GCJ-02' || crs === 'GCJ02';
}

function isBd09(crs: string | null): boolean {
  return crs === 'BD-09' || crs === 'BD09';
}

export function transformCoordBetweenCrs(coord: number[], fromCrs: string, toCrs: string): number[] {
  const from = resolveCrs(fromCrs) || 'WGS84';
  const to = resolveCrs(toCrs) || 'WGS84';
  if (from === to) return coord;

  let point: number[] = [coord[0], coord[1]];

  if (isBd09(from)) {
    const [lng, lat] = bd09ToGcj02(point[0], point[1]);
    point = [lng, lat];
  }
  if (isGcj02(from) || isBd09(from)) {
    const [lng, lat] = gcj02ToWgs84(point[0], point[1]);
    point = [lng, lat];
  } else if (!isLngLatAlias(from)) {
    const projected = proj4(from, 'WGS84', point);
    point = [projected[0], projected[1]];
  }

  if (!isLngLatAlias(to) && !isGcj02(to) && !isBd09(to)) {
    const projected = proj4('WGS84', to, point);
    return [projected[0], projected[1]];
  }

  if (isGcj02(to) || isBd09(to)) {
    const [lng, lat] = wgs84ToGcj02(point[0], point[1]);
    point = [lng, lat];
  }
  if (isBd09(to)) {
    const [lng, lat] = gcj02ToBd09(point[0], point[1]);
    point = [lng, lat];
  }

  return point;
}

export { proj4 };
