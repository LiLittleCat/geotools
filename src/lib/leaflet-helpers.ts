import L from 'leaflet';
import type { Geom } from './parse';

export function addGeomToGroup(
  group: L.FeatureGroup,
  geom: Geom,
  color: string,
): L.FeatureGroup {
  const pointStyle: L.CircleMarkerOptions = {
    radius: 6,
    fillColor: color,
    color: '#ffffff',
    weight: 2,
    opacity: 1,
    fillOpacity: 1,
  };
  const lineStyle: L.PathOptions = { color, weight: 3, opacity: 0.95 };
  const polyStyle: L.PathOptions = {
    color,
    weight: 2,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: 0.18,
  };

  L.geoJSON(geom as any, {
    pointToLayer: (_feat, latlng) => L.circleMarker(latlng, pointStyle),
    style: (feat) => {
      const t = feat && feat.geometry ? feat.geometry.type : geom.type;
      if (t && t.includes('Line')) return lineStyle;
      return polyStyle;
    },
  }).eachLayer((l) => group.addLayer(l));

  return group;
}

export function pointIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1.5px ${color};"></div>`,
  });
}
