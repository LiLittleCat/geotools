import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGeometry } from '../src/lib/parse.ts';
import {
  buildConverterCopyOptions,
  buildConverterCopyText,
  resolveConverterOutputFormat,
} from '../src/components/converter-format.ts';

test('resolveConverterOutputFormat flips GeoJSON and WKT in format mode', () => {
  assert.equal(resolveConverterOutputFormat('format', parseGeometry('{"type":"Point","coordinates":[1,2]}')), 'WKT');
  assert.equal(resolveConverterOutputFormat('format', parseGeometry('POINT (1 2)')), 'GeoJSON');
});

test('resolveConverterOutputFormat preserves the input format in crs mode', () => {
  assert.equal(resolveConverterOutputFormat('crs', parseGeometry('{"type":"Point","coordinates":[1,2]}')), 'GeoJSON');
  assert.equal(resolveConverterOutputFormat('crs', parseGeometry('POINT (1 2)')), 'WKT');
});

test('buildConverterCopyOptions exposes GeoJSON and WKT with the active format marked', () => {
  assert.deepEqual(buildConverterCopyOptions('WKT'), [
    { label: 'Copy as GeoJSON', value: 'GeoJSON', active: false },
    { label: 'Copy as WKT', value: 'WKT', active: true },
  ]);
});

test('buildConverterCopyText stringifies transformed geometry into the requested format', () => {
  const parsed = parseGeometry('{"type":"Point","coordinates":[1,2]}');
  assert.ok(parsed.ok);
  assert.equal(buildConverterCopyText(parsed.geom, 'WKT'), 'POINT (1 2)');
  assert.match(buildConverterCopyText(parsed.geom, 'GeoJSON'), /"type": "Point"/);
});
