import test from 'node:test';
import assert from 'node:assert/strict';

import { drawnLayerName } from '../src/components/visualizer-layer-naming.ts';

test('drawnLayerName keeps rectangle and circle names aligned with the draw tool', () => {
  assert.equal(drawnLayerName(2, 'Polygon', 'Rectangle'), 'Rectangle 3');
  assert.equal(drawnLayerName(4, 'Polygon', 'Circle'), 'Circle 5');
});

test('drawnLayerName falls back to the geometry type for other shapes', () => {
  assert.equal(drawnLayerName(1, 'Polygon'), 'Polygon 2');
  assert.equal(drawnLayerName(0, 'LineString', 'Line'), 'LineString 1');
});
