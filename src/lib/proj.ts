import proj4 from 'proj4';

export function utmProjString(zone: number, hemi: 'N' | 'S'): string {
  const south = hemi === 'S' ? ' +south' : '';
  return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`;
}

/** coord is [lng, lat] in WGS84; toProj is a proj4 definition; returns [x,y] in meters. */
export function projectCoord(coord: number[], toProj: string): number[] {
  if (toProj === 'WGS84') return coord;
  try {
    const [x, y] = proj4('WGS84', toProj, [coord[0], coord[1]]);
    return [x, y];
  } catch {
    return coord;
  }
}

export function unprojectCoord(xy: number[], fromProj: string): number[] {
  if (fromProj === 'WGS84') return xy;
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

export const CRS_PRESETS: CrsPreset[] = [
  { id: 'EPSG:4326', label: 'WGS84 (lng/lat)', proj: 'WGS84' },
  { id: 'EPSG:32649', label: 'UTM Zone 49N', proj: '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs' },
  { id: 'EPSG:32650', label: 'UTM Zone 50N', proj: '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs' },
  { id: 'EPSG:32651', label: 'UTM Zone 51N', proj: '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs' },
  { id: 'EPSG:3857', label: 'Web Mercator', proj: 'EPSG:3857' },
];

export const CRS_PRESETS_UTM_NS: CrsPreset[] = (() => {
  const out: CrsPreset[] = [];
  for (let z = 1; z <= 60; z++)
    out.push({ id: `UTM${z}N`, label: `UTM Zone ${z}N`, proj: `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs` });
  for (let z = 1; z <= 60; z++)
    out.push({ id: `UTM${z}S`, label: `UTM Zone ${z}S`, proj: `+proj=utm +zone=${z} +south +datum=WGS84 +units=m +no_defs` });
  return out;
})();

export function resolveCrs(id: string): string | null {
  const p =
    CRS_PRESETS.find((x) => x.id === id) ||
    CRS_PRESETS_UTM_NS.find((x) => x.id === id || x.proj === id);
  return p ? p.proj : id || null;
}

export function isUtmCrs(id: string): boolean {
  if (!id) return false;
  if (typeof id === 'string' && /\+proj=utm/i.test(id)) return true;
  return CRS_PRESETS_UTM_NS.some((x) => x.id === id || x.proj === id);
}

export function crsShort(id: string): string {
  if (!id) return '';
  if (typeof id === 'string' && /\+proj=utm/i.test(id)) {
    const z = id.match(/\+zone=(\d+)/i);
    const s = /\+south\b/i.test(id);
    return z ? `UTM ${z[1]}${s ? 'S' : 'N'}` : 'UTM';
  }
  const p =
    CRS_PRESETS.find((x) => x.id === id) ||
    CRS_PRESETS_UTM_NS.find((x) => x.id === id || x.proj === id);
  return p ? p.id : id;
}

export { proj4 };
