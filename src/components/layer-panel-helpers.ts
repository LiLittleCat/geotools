const EXPANDED_TEXTAREA_MIN_HEIGHT = 220;

export function expandedTextareaHeight(scrollHeight: number) {
  return `${Math.max(scrollHeight, EXPANDED_TEXTAREA_MIN_HEIGHT)}px`;
}
