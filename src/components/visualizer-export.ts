import {
  extractSingleFeatureProperties,
  stringifyGeom,
  type ParseResult,
} from '../lib/parse.ts';

export type WktExportMode = 'collection' | 'layered';

export interface ExportLayerInput {
  name: string;
  text: string;
  color: string;
  visible: boolean;
  locked: boolean;
  source: 'drawn' | 'file' | null;
  parseResult: ParseResult | null;
}

function exportableLayers(layers: ExportLayerInput[]) {
  return layers.filter((layer) => layer.parseResult && layer.parseResult.ok) as Array<ExportLayerInput & {
    parseResult: Extract<ParseResult, { ok: true }>;
  }>;
}

export function buildAllLayersGeoJsonExport(layers: ExportLayerInput[]) {
  const features = exportableLayers(layers).map((layer) => ({
    type: 'Feature',
    properties: (() => {
      const properties = extractSingleFeatureProperties(layer.text) || {};
      if (!Object.hasOwn(properties, 'name')) properties.name = layer.name;
      return properties;
    })(),
    geometry: layer.parseResult.geom,
  }));
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

export function buildAllLayersWktExport(layers: ExportLayerInput[], mode: WktExportMode) {
  const exportable = exportableLayers(layers);
  if (mode === 'layered') {
    return exportable
      .map((layer, index) => `# ${index + 1}. ${layer.name}\n${stringifyGeom(layer.parseResult.geom, 'WKT')}`)
      .join('\n\n');
  }
  return stringifyGeom({
    type: 'GeometryCollection',
    geometries: exportable.map((layer) => layer.parseResult.geom),
  }, 'WKT');
}
