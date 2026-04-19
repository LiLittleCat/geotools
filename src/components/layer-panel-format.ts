import { stringifyGeom, type Geom, type ParseResult } from '../lib/parse.ts';

export type LayerTextFormat = 'GeoJSON' | 'WKT';

export interface LayerFormatOption {
  label: string;
  value: LayerTextFormat;
  active: boolean;
}

export function formatVerticesLabel(type: string, vertices: number) {
  return `${type} · ${vertices} Vertices`;
}

export function buildLayerCopyOptions(current: LayerTextFormat): LayerFormatOption[] {
  return [
    { label: 'Copy as GeoJSON', value: 'GeoJSON', active: current === 'GeoJSON' },
    { label: 'Copy as WKT', value: 'WKT', active: current === 'WKT' },
  ];
}

export function buildLayerCopyText(sourceText: string, parseResult: ParseResult | null, format: LayerTextFormat) {
  if (!parseResult || !parseResult.ok) return '';
  if (parseResult.format === format) return sourceText;
  return stringifyGeom(parseResult.geom as Geom, format);
}

export function currentLayerFormat(parseResult: ParseResult | null): LayerTextFormat | null {
  return parseResult && parseResult.ok ? parseResult.format : null;
}
