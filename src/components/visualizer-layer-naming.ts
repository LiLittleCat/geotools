export function drawnLayerName(index: number, geomType: string, shape?: string) {
  const normalizedShape = (shape || '').toLowerCase();
  if (normalizedShape === 'rectangle' || normalizedShape === 'rect') {
    return `Rectangle ${index + 1}`;
  }
  if (normalizedShape === 'circle') {
    return `Circle ${index + 1}`;
  }
  return `${geomType} ${index + 1}`;
}
