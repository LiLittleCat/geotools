import { stringifyGeom, type Geom, type ParseResult } from '../lib/parse.ts';

export type ConverterMode = 'format' | 'crs';
export type ConverterTextFormat = 'GeoJSON' | 'WKT';

export interface ConverterCopyOption {
  label: string;
  value: ConverterTextFormat;
  active: boolean;
}

export function resolveConverterOutputFormat(
  mode: ConverterMode,
  parseResult: ParseResult | null,
): ConverterTextFormat | null {
  if (!parseResult || !parseResult.ok) return null;
  if (mode === 'crs') return parseResult.format;
  return parseResult.format === 'GeoJSON' ? 'WKT' : 'GeoJSON';
}

export function buildConverterCopyOptions(current: ConverterTextFormat | null): ConverterCopyOption[] {
  return [
    { label: 'Copy as GeoJSON', value: 'GeoJSON', active: current === 'GeoJSON' },
    { label: 'Copy as WKT', value: 'WKT', active: current === 'WKT' },
  ];
}

export function buildConverterCopyText(geom: Geom, format: ConverterTextFormat) {
  return stringifyGeom(geom, format);
}
