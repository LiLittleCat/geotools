export function activateLegendLayer(
  id: string,
  onSelect: (id: string) => void,
  onZoomTo: (id: string) => void,
) {
  onSelect(id);
  onZoomTo(id);
}
