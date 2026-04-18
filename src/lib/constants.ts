export const PALETTE = [
  '#e8a55c', '#5cc8c0', '#b08be0', '#e08b9e',
  '#a8c86b', '#6fb0e0', '#e8846b', '#7fc99a',
  '#d4a373', '#9fa8da', '#ce93d8', '#80cbc4',
];

export const SAMPLES: Record<string, string> = {
  polygon: `{
  "type": "Polygon",
  "coordinates": [[
    [-122.5150, 37.7080],
    [-122.5150, 37.8100],
    [-122.3570, 37.8100],
    [-122.3570, 37.7080],
    [-122.5150, 37.7080]
  ]]
}`,
  line: `LINESTRING (-122.4783 37.8199, -122.4194 37.7749, -122.3893 37.7955, -122.3560 37.7875)`,
  point: `POINT (-122.4194 37.7749)`,
};

export const TILE_STYLES = {
  'carto-voyager': {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    attr: '© OpenStreetMap · © CARTO',
  },
  'carto-labels': {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attr: '© OpenStreetMap · © CARTO',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap contributors',
  },
} as const;

export type TileStyleId = keyof typeof TILE_STYLES;

export const TWEAKS_DEFAULTS = {
  theme: 'light' as 'light' | 'dark' | 'auto',
  tileStyle: 'carto-voyager' as TileStyleId,
  autoRender: false,
  showLabels: true,
};
