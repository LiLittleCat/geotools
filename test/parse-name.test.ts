import test from 'node:test';
import assert from 'node:assert/strict';

import { extractSingleFeatureName } from '../src/lib/parse.ts';

test('extractSingleFeatureName returns the properties.name from a single GeoJSON feature', () => {
  const text = JSON.stringify({
    type: 'Feature',
    properties: { name: 'Imported bounds', color: '#ffaa33' },
    geometry: {
      type: 'Polygon',
      coordinates: [[[-122.5, 37.7], [-122.4, 37.7], [-122.4, 37.8], [-122.5, 37.7]]],
    },
  });

  assert.equal(extractSingleFeatureName(text), 'Imported bounds');
});

test('extractSingleFeatureName ignores FeatureCollections even when child features have names', () => {
  const text = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'A' },
        geometry: { type: 'Point', coordinates: [-122.5, 37.7] },
      },
      {
        type: 'Feature',
        properties: { name: 'B' },
        geometry: { type: 'Point', coordinates: [-122.4, 37.8] },
      },
    ],
  });

  assert.equal(extractSingleFeatureName(text), null);
});

test('extractSingleFeatureName ignores missing or blank names', () => {
  assert.equal(extractSingleFeatureName('{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[0,0]}}'), null);
  assert.equal(extractSingleFeatureName('{"type":"Feature","properties":{"name":"   "},"geometry":{"type":"Point","coordinates":[0,0]}}'), null);
});
