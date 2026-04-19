import { stringifyGeom, type Geom, type ParseResult } from '../lib/parse.ts';

export type LayerTextFormat = 'GeoJSON' | 'WKT';

export interface LayerFormatOption {
  label: LayerTextFormat;
  value: LayerTextFormat;
  active: boolean;
}

export function formatVerticesLabel(type: string, vertices: number) {
  return `${type} · ${vertices} Vertices`;
}

export function buildLayerFormatOptions(current: LayerTextFormat): LayerFormatOption[] {
  return [
    { label: 'GeoJSON', value: 'GeoJSON', active: current === 'GeoJSON' },
    { label: 'WKT', value: 'WKT', active: current === 'WKT' },
  ];
}

export function convertLayerTextFormat(geom: Geom, format: LayerTextFormat) {
  return stringifyGeom(geom, format);
}

export function currentLayerFormat(parseResult: ParseResult | null): LayerTextFormat | null {
  return parseResult && parseResult.ok ? parseResult.format : null;
}
