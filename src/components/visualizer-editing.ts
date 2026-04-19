interface LatLngLike {
  lat: number;
  lng: number;
  alt?: number;
}

interface MarkerLike {
  getLatLng?: () => LatLngLike;
  setLatLng?: (latlng: LatLngLike) => void;
}

function firstLeafLatLng(value: unknown): LatLngLike | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstLeafLatLng(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null && 'lat' in value && 'lng' in value) {
    return value as LatLngLike;
  }
  return null;
}

function firstMarker(value: unknown): MarkerLike | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstMarker(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null && 'getLatLng' in value) {
    return value as MarkerLike;
  }
  return null;
}

export function buildLayerEditOptions() {
  return {
    snappable: true,
    allowSelfIntersection: true,
    allowEditing: true,
  } as const;
}

export function syncDraggedEditMarkers(layer: {
  getLatLngs?: () => unknown;
  pm?: {
    enabled?: () => boolean;
    _markers?: unknown;
    _markerGroup?: { getLayers?: () => MarkerLike[] };
  };
}) {
  const pm = layer.pm;
  if (!pm?.enabled?.()) return;

  const leadVertex = firstLeafLatLng(layer.getLatLngs?.());
  const leadMarker = firstMarker(pm._markers);
  const markerLatLng = leadMarker?.getLatLng?.();
  const markerLayers = pm._markerGroup?.getLayers?.();

  if (!leadVertex || !markerLatLng || !markerLayers?.length) return;

  const deltaLat = leadVertex.lat - markerLatLng.lat;
  const deltaLng = leadVertex.lng - markerLatLng.lng;
  if (deltaLat === 0 && deltaLng === 0) return;

  markerLayers.forEach((marker) => {
    const latlng = marker.getLatLng?.();
    if (!latlng || !marker.setLatLng) return;
    marker.setLatLng({
      ...latlng,
      lat: latlng.lat + deltaLat,
      lng: latlng.lng + deltaLng,
    });
  });
}
