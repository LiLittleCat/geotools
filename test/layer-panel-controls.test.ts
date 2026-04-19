import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLayerPanelControls } from '../src/components/layer-panel-controls.ts';

test('buildLayerPanelControls keeps text-edit actions inside the textarea toolbar', () => {
  const controls = buildLayerPanelControls({
    autoRender: false,
    copied: false,
    expanded: false,
    hasText: true,
    isLocked: false,
  });

  assert.deepEqual(
    controls.textareaTools.map((tool) => tool.id),
    ['copy', 'clear', 'expand'],
  );
  assert.deepEqual(
    controls.footerTools.map((tool) => tool.id),
    ['upload', 'render'],
  );
});

test('buildLayerPanelControls disables destructive text tools for locked layers', () => {
  const controls = buildLayerPanelControls({
    autoRender: false,
    copied: true,
    expanded: true,
    hasText: true,
    isLocked: true,
  });

  assert.equal(controls.textareaTools.find((tool) => tool.id === 'copy')?.disabled, false);
  assert.equal(controls.textareaTools.find((tool) => tool.id === 'copy')?.title, 'Copied!');
  assert.equal(controls.textareaTools.find((tool) => tool.id === 'clear')?.disabled, true);
  assert.equal(controls.textareaTools.find((tool) => tool.id === 'expand')?.title, 'Collapse full text');
  assert.deepEqual(
    controls.footerTools.map((tool) => [tool.id, tool.disabled]),
    [['upload', true]],
  );
});
