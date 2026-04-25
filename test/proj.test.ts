import test from 'node:test';
import assert from 'node:assert/strict';

import { crsShort, resolveCrs, transformCoordBetweenCrs } from '../src/lib/proj.ts';

test('China CRS presets resolve and display short labels', () => {
  assert.equal(resolveCrs('EPSG:4490'), 'CGCS2000');
  assert.equal(resolveCrs('GCJ-02'), 'GCJ-02');
  assert.equal(resolveCrs('BD-09'), 'BD-09');
  assert.equal(crsShort('GCJ-02'), 'GCJ-02');
});

test('transforms WGS84 to GCJ-02 and BD-09 near Beijing', () => {
  const wgs84 = [116.397, 39.908];
  const gcj02 = transformCoordBetweenCrs(wgs84, 'EPSG:4326', 'GCJ-02');
  const bd09 = transformCoordBetweenCrs(wgs84, 'EPSG:4326', 'BD-09');

  assert.ok(gcj02[0] > 116.402 && gcj02[0] < 116.405);
  assert.ok(gcj02[1] > 39.909 && gcj02[1] < 39.911);
  assert.ok(bd09[0] > gcj02[0]);
  assert.ok(bd09[1] > gcj02[1]);
});

test('transforms BD-09 back to WGS84 near the original coordinate', () => {
  const wgs84 = [116.397, 39.908];
  const bd09 = transformCoordBetweenCrs(wgs84, 'EPSG:4326', 'BD-09');
  const restored = transformCoordBetweenCrs(bd09, 'BD-09', 'EPSG:4326');

  assert.ok(Math.abs(restored[0] - wgs84[0]) < 0.0002);
  assert.ok(Math.abs(restored[1] - wgs84[1]) < 0.0002);
});
