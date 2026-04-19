import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGeometry } from '../src/lib/parse.ts';
import {
  buildLayerCopyOptions,
  buildLayerCopyText,
  formatVerticesLabel,
} from '../src/components/layer-panel-format.ts';

test('formatVerticesLabel uses Vertices and omits the source format', () => {
  assert.equal(formatVerticesLabel('Polygon', 5), 'Polygon · 5 Vertices');
});

test('buildLayerCopyOptions exposes the two supported copy formats', () => {
  assert.deepEqual(buildLayerCopyOptions('GeoJSON'), [
    { label: 'Copy as GeoJSON', value: 'GeoJSON', active: true },
    { label: 'Copy as WKT', value: 'WKT', active: false },
  ]);
});

test('buildLayerCopyText preserves original GeoJSON source text when copying in the same format', () => {
  const source = `{
  "type": "Feature",
  "properties": {
    "name": "Preserve me"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [-122.4, 37.78]
  }
}`;

  const parsed = parseGeometry(source);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(buildLayerCopyText(source, parsed, 'GeoJSON'), source);
});

test('buildLayerCopyText rewrites geometry text as WKT without changing coordinates', () => {
  const source = `{
  "type": "Polygon",
  "coordinates": [
    [
      [-122.538351, 37.725914],
      [-122.54665, 37.817173],
      [-122.364944, 37.810106],
      [-122.349151, 37.708365],
      [-122.538351, 37.725914]
    ]
  ]
}`;

  const parsed = parseGeometry(source);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const converted = buildLayerCopyText(source, parsed, 'WKT');
  assert.match(converted, /^POLYGON/);

  const reparsed = parseGeometry(converted);
  assert.equal(reparsed.ok, true);
  if (!reparsed.ok) return;
  assert.deepEqual(reparsed.geom, parsed.geom);
});
