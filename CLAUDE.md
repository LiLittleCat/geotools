# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Start dev server (Vite HMR)
pnpm build      # Type-check + build for production (tsc -b && vite build)
pnpm lint       # Run ESLint
pnpm preview    # Preview the production build
```

No test suite is configured.

## Architecture

GeoTools is a single-page React app (React 19, TypeScript, Vite) for working with geospatial data. It has two top-level tabs managed in `App.tsx` via `localStorage`-persisted state:

- **Visualizer** (`Visualizer.tsx`) — A Leaflet map with a layer sidebar. Users paste GeoJSON/WKT into per-layer text boxes, upload files (`.geojson`, `.json`, `.wkt`, `.txt`), or draw geometries directly on the map using Geoman. Layer state (text, color, visibility, lock) is persisted to `localStorage` under `geotools.layers`. Leaflet `FeatureGroup` instances are kept in `layerGroupsRef` (keyed by layer ID), separate from React state.

- **Converter** (`Converter.tsx`) — Converts geometry between GeoJSON↔WKT formats and reprojects coordinates between CRS (e.g. WGS84, UTM zones, Web Mercator). It also shows a small Leaflet preview map.

### Key lib modules

| File | Purpose |
|------|---------|
| `src/lib/parse.ts` | Parse GeoJSON/WKT text → `ParseResult`; stringify geom back; walk/transform all coordinates via `transformGeom` |
| `src/lib/proj.ts` | Wraps `proj4`; CRS presets; `resolveCrs`, `isUtmCrs`, `crsShort` helpers |
| `src/lib/leaflet-helpers.ts` | `addGeomToGroup` renders a `Geom` onto a Leaflet `FeatureGroup`; `pointIcon` creates a colored `DivIcon` |
| `src/lib/constants.ts` | `PALETTE` (12 colors), `SAMPLES` (demo GeoJSON/WKT), `TILE_STYLES`, `TWEAKS_DEFAULTS` |

### Shared UI components

- `AppShell` — header bar with tab switcher and theme toggle
- `LayerPanel` — per-layer card in the sidebar (text input, upload, visibility/lock toggles)
- `Legend` — compact map overlay listing layer colors
- `ThemeCtx` — React context for `light`/`dark`/`auto` theme; actual CSS is applied via `data-theme` attribute on `<html>`
- `Icon` — inline SVG icon component

### Leaflet / Geoman integration pattern

The Leaflet map is initialized once in a `useEffect` with an empty dep array, stored in `mapRef`. Geoman (`@geoman-io/leaflet-geoman-free`) is enabled globally on that map instance. Draw tool mode is controlled by a `tool` state variable (`cursor | point | line | polygon | rect`); an effect responds to changes and calls `map.pm.enableDraw` / `map.pm.enableGlobalEditMode`. When Geoman fires `pm:create`, the drawn layer is removed from the map and re-added as a React-managed layer. When vertices are edited (`pm:edit` / `pm:dragend`), the geometry is serialized back via `toGeoJSON()` and stored into React state, preserving the original format (GeoJSON vs WKT).
