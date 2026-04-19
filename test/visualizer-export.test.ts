import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGeometry } from '../src/lib/parse.ts';
import {
  buildAllLayersGeoJsonExport,
  buildAllLayersWktExport,
} from '../src/components/visualizer-export.ts';

const polygon = parseGeometry('{"type":"Polygon","coordinates":[[[-122.5,37.7],[-122.4,37.7],[-122.4,37.8],[-122.5,37.7]]]}');
const line = parseGeometry('LINESTRING (-122.5 37.85, -122.47 37.83, -122.41 37.82)');

test('buildAllLayersGeoJsonExport emits a FeatureCollection with only layer name in properties', () => {
  const text = buildAllLayersGeoJsonExport([
    {
      name: 'Bounds',
      text: '',
      color: '#ffaa33',
      visible: true,
      locked: false,
      source: 'drawn',
      parseResult: polygon,
    },
    {
      name: 'Route',
      text: '',
      color: '#22bbbb',
      visible: false,
      locked: true,
      source: 'file',
      parseResult: line,
    },
  ]);

  const json = JSON.parse(text);
  assert.equal(json.type, 'FeatureCollection');
  assert.equal(json.features.length, 2);
  assert.deepEqual(json.features[0].properties, {
    name: 'Bounds',
  });
  assert.deepEqual(json.features[1].properties, {
    name: 'Route',
  });
});

test('buildAllLayersGeoJsonExport preserves single-feature properties and adds name only when missing', () => {
  const text = buildAllLayersGeoJsonExport([
    {
      name: 'Bounds',
      text: JSON.stringify({
        type: 'Feature',
        properties: {
          category: 'park',
          active: true,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-122.5, 37.7], [-122.4, 37.7], [-122.4, 37.8], [-122.5, 37.7]]],
        },
      }),
      color: '#ffaa33',
      visible: true,
      locked: false,
      source: 'file',
      parseResult: polygon,
    },
    {
      name: 'Layer name should not overwrite source name',
      text: JSON.stringify({
        type: 'Feature',
        properties: {
          name: 'Source name',
          category: 'route',
        },
        geometry: {
          type: 'LineString',
          coordinates: [[-122.5, 37.85], [-122.47, 37.83], [-122.41, 37.82]],
        },
      }),
      color: '#22bbbb',
      visible: true,
      locked: false,
      source: 'file',
      parseResult: line,
    },
  ]);

  const json = JSON.parse(text);
  assert.deepEqual(json.features[0].properties, {
    category: 'park',
    active: true,
    name: 'Bounds',
  });
  assert.deepEqual(json.features[1].properties, {
    name: 'Source name',
    category: 'route',
  });
});

test('buildAllLayersWktExport can emit a standard GeometryCollection or layered text', () => {
  const layers = [
    {
      name: 'Bounds',
      text: '',
      color: '#ffaa33',
      visible: true,
      locked: false,
      source: 'drawn' as const,
      parseResult: polygon,
    },
    {
      name: 'Route',
      text: '',
      color: '#22bbbb',
      visible: true,
      locked: false,
      source: 'file' as const,
      parseResult: line,
    },
  ];

  const collection = buildAllLayersWktExport(layers, 'collection');
  assert.match(collection, /^GEOMETRYCOLLECTION/);

  const layered = buildAllLayersWktExport(layers, 'layered');
  assert.match(layered, /# 1\. Bounds/);
  assert.match(layered, /# 2\. Route/);
  assert.match(layered, /LINESTRING/);
});
