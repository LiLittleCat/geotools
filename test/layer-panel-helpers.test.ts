import test from 'node:test';
import assert from 'node:assert/strict';

import { expandedTextareaHeight } from '../src/components/layer-panel-helpers.ts';

test('expandedTextareaHeight never shrinks below the expanded minimum', () => {
  assert.equal(expandedTextareaHeight(120), '220px');
});

test('expandedTextareaHeight uses the full scroll height for long content', () => {
  assert.equal(expandedTextareaHeight(468), '468px');
});
