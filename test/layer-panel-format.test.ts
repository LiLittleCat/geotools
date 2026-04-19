import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGeometry } from '../src/lib/parse.ts';
import {
  buildLayerFormatOptions,
  convertLayerTextFormat,
  formatVerticesLabel,
} from '../src/components/layer-panel-format.ts';

test('formatVerticesLabel uses Vertices and omits the source format', () => {
  assert.equal(formatVerticesLabel('Polygon', 5), 'Polygon · 5 Vertices');
});

test('buildLayerFormatOptions exposes the two supported text formats', () => {
  assert.deepEqual(buildLayerFormatOptions('GeoJSON'), [
    { label: 'GeoJSON', value: 'GeoJSON', active: true },
    { label: 'WKT', value: 'WKT', active: false },
  ]);
});

test('convertLayerTextFormat rewrites geometry text as WKT without changing coordinates', () => {
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

  const converted = convertLayerTextFormat(parsed.geom, 'WKT');
  assert.match(converted, /^POLYGON/);

  const reparsed = parseGeometry(converted);
  assert.equal(reparsed.ok, true);
  if (!reparsed.ok) return;
  assert.deepEqual(reparsed.geom, parsed.geom);
});
