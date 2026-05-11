import { transformGeom, type Geom } from './parse';
import { isUtmCrs, resolveCrs, transformCoordBetweenCrs } from './proj';

export interface CoordinateOffset {
  enabled: boolean;
  x: number;
  y: number;
}

export function numericCoordinateOffset(offset: {
  enabled: boolean;
  x: number | string;
  y: number | string;
}): CoordinateOffset {
  return {
    enabled: offset.enabled,
    x: Number(offset.x) || 0,
    y: Number(offset.y) || 0,
  };
}

function withZ(source: number[], point: number[]) {
  return source.length > 2 ? [point[0], point[1], source[2]] : point;
}

export function addCoordinateOffset(coord: number[], offset: CoordinateOffset): number[] {
  if (!offset.enabled || (!offset.x && !offset.y)) return coord;
  return [coord[0] + offset.x, coord[1] + offset.y];
}

export function subtractCoordinateOffset(coord: number[], offset: CoordinateOffset): number[] {
  if (!offset.enabled || (!offset.x && !offset.y)) return coord;
  return [coord[0] - offset.x, coord[1] - offset.y];
}

export function sourceCoordToMapCoord(coord: number[], sourceCrs: string, offset: CoordinateOffset): number[] {
  const adjusted = addCoordinateOffset(coord, offset);
  return transformCoordBetweenCrs(adjusted, sourceCrs, 'EPSG:4326');
}

export function mapCoordToSourceCoord(coord: number[], sourceCrs: string, offset: CoordinateOffset): number[] {
  const projected = transformCoordBetweenCrs(coord, 'EPSG:4326', sourceCrs);
  return subtractCoordinateOffset(projected, offset);
}

export function sourceGeomToMapGeom(geom: Geom, sourceCrs: string, offset: CoordinateOffset): Geom {
  const sameCrs = (resolveCrs(sourceCrs) || sourceCrs) === (resolveCrs('EPSG:4326') || 'EPSG:4326');
  const hasOffset = offset.enabled && (!!offset.x || !!offset.y);
  if (sameCrs && !hasOffset) return geom;

  return transformGeom(geom, (coord) => withZ(coord, sourceCoordToMapCoord(coord, sourceCrs, offset)));
}

export function mapGeomToSourceGeom(geom: Geom, sourceCrs: string, offset: CoordinateOffset): Geom {
  const sameCrs = (resolveCrs(sourceCrs) || sourceCrs) === (resolveCrs('EPSG:4326') || 'EPSG:4326');
  const hasOffset = offset.enabled && (!!offset.x || !!offset.y);
  if (sameCrs && !hasOffset) return geom;

  return transformGeom(geom, (coord) => withZ(coord, mapCoordToSourceCoord(coord, sourceCrs, offset)));
}

export function isProjectedDisplayCrs(crs: string) {
  const resolved = resolveCrs(crs) || crs;
  return resolved === 'EPSG:3857' || isUtmCrs(crs) || /^\+proj=/i.test(resolved);
}
