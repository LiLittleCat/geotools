import test from 'node:test';
import assert from 'node:assert/strict';

import { activateLegendLayer } from '../src/components/legend-helpers.ts';

test('activateLegendLayer selects the layer before zooming to it', () => {
  const calls: string[] = [];

  activateLegendLayer(
    'layer-1',
    (id) => { calls.push(`select:${id}`); },
    (id) => { calls.push(`zoom:${id}`); },
  );

  assert.deepEqual(calls, [
    'select:layer-1',
    'zoom:layer-1',
  ]);
});
