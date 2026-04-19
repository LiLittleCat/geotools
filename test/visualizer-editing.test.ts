import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLayerEditOptions,
  syncDraggedEditMarkers,
} from '../src/components/visualizer-editing.ts';

test('buildLayerEditOptions only configures edit mode options', () => {
  assert.deepEqual(buildLayerEditOptions(), {
    snappable: true,
    allowSelfIntersection: true,
    allowEditing: true,
  });
});

test('syncDraggedEditMarkers shifts Geoman markers to the layer position during drag', () => {
  const moved: Array<{ lat: number; lng: number }> = [];
  const markers = [
    {
      latlng: { lat: 1, lng: 2 },
      getLatLng() { return this.latlng; },
      setLatLng(next: { lat: number; lng: number }) {
        this.latlng = next;
        moved.push(next);
      },
    },
    {
      latlng: { lat: 1.5, lng: 2.5 },
      getLatLng() { return this.latlng; },
      setLatLng(next: { lat: number; lng: number }) {
        this.latlng = next;
        moved.push(next);
      },
    },
  ];

  syncDraggedEditMarkers({
    getLatLngs: () => [{ lat: 3, lng: 5 }, { lat: 4, lng: 6 }],
    pm: {
      enabled: () => true,
      _markers: [markers[0]],
      _markerGroup: { getLayers: () => markers },
    },
  });

  assert.deepEqual(moved, [
    { lat: 3, lng: 5 },
    { lat: 3.5, lng: 5.5 },
  ]);
});
