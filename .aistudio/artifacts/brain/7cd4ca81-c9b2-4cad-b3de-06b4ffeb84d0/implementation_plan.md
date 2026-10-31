# SITELENS — DESIGN SYSTEM v1.1 & TOPOGRAPHIC PRECISION IMPLEMENTATION PLAN

## 1. Architectural Vision & References Alignment
Based on the five provided reference designs and your selections:
- **Reference 1 & 5 (Cuatro × Homai & BMS 3D)**: Full-bleed map canvas with floating translucent glass HUD components (`backdrop-blur-md`, subtle 1px border `rgba(255,255,255,0.08)`, floating top navigation island, floating left CAD tool dock, floating right analytical drawer, and floating bottom telemetry bar).
- **Reference 3 (Geometric Folded 'S' Ribbon Aperture)**: Continuous geometric ribbon glyph forming a central spatial datum lens aperture in Geo Purple (`#7C5CFF` to `#A78BFA`), scaling seamlessly from 16px to 64px in dark and light modes.
- **Reference 2 (Kepler.gl Topographic Contours)**: Topographic contour lines with hypsometric elevation tinting (emerald-to-cyan-to-violet color ramps), customizable contour intervals, opacity controls, and an interactive elevation legend.
- **Reference 4 (Synaptix Contemporary Digital Design)**: Dark-first aesthetic with restrained accents, clean KPI cards, sparkline metrics, and sans-serif tabular numerals.

---

## 2. Core Modules & Implementation Scope

### Phase 1: Brand Identity & Geometric Logo (`SiteLensLogo.tsx`)
- Re-architect `src/components/SiteLensLogo.tsx` with precision SVG paths implementing the folded "S" ribbon mark:
  - Dual continuous curved ribbons intersecting around a central negative-space square datum lens.
  - Linear gradient in Geo Purple: `#7C5CFF` (base) to `#A78BFA` (highlight) with dark/light background adaptation.
  - Dual lockups: standalone geometric icon and full wordmark with Manrope display font (`Site` in primary text, `Lens` in brand gradient).

### Phase 2: Design Tokens & Glassmorphic Surface System (`tokens.ts` & `index.css`)
- Enhance CSS variables for translucent glass surfaces:
  - Dark HUD: `--bg-glass: rgba(20, 23, 33, 0.78)`, `--border-glass: rgba(255, 255, 255, 0.08)`, `--shadow-glass: 0 8px 32px 0 rgba(0, 0, 0, 0.36)`.
  - Light HUD: `--bg-glass: rgba(255, 255, 255, 0.82)`, `--border-glass: rgba(0, 0, 0, 0.07)`, `--shadow-glass: 0 8px 32px 0 rgba(0, 0, 0, 0.08)`.
  - Backdrop blur utility: `backdrop-filter: blur(16px) saturate(180%)`.
- Topographic hypsometric color ramps:
  - Bathymetric/Lowland: Emerald (`#10B981`) -> Cyan (`#06B6D4`) -> Highland: Violet (`#7C5CFF`) -> Peak: Amber/White (`#F59E0B`).

### Phase 3: Full-Bleed Map Layout & Floating HUD Components
- **Full-Bleed Map (`App.tsx` & `MapCanvas.tsx`)**:
  - The MapLibre map expands to `absolute inset-0 w-full h-full`.
  - Map navigation controls (zoom, compass, 3D tilt, pitch) positioned cleanly on the floating canvas.
- **Floating TopBar HUD (`TopBar.tsx`)**:
  - Floating island centered/anchored at `top-4 left-4 right-4` with responsive max-width.
  - In-place project name edit, direct coordinate navigation, geocoding search, basemap selector, theme toggle, and export buttons.
- **Floating CAD Tool Island (`ToolBar.tsx`)**:
  - Floating vertical glass dock anchored at `top-20 left-4`.
  - Quick keyboard shortcuts (`V`, `H`, `P`, `L`, Point, `T`), active states in Geo Purple, and subtle tooltips.
- **Floating Analytical Drawer (`InspectorPanel.tsx`)**:
  - Floating glass panel anchored at `top-20 right-4 bottom-12 w-96`.
  - Collapsible toggle to give designers an unobstructed view of the site.
  - Tabbed architecture: *Overview*, *Geometry & CAD*, *Coordinates*, *Topography & Contours*, and *Environment*.
- **Floating Status Pill (`BottomBar.tsx`)**:
  - Floating pill anchored at `bottom-4 left-4`.
  - Tabular coordinates with dynamic hemisphere indicators (`N`/`S`, `E`/`W`), UTM reference, zoom level, and WGS84 datum.

### Phase 4: Topographic Contour & Hypsometric Elevation Engine (`src/topography/`)
- Create dedicated module `src/topography/contours.ts` and `src/topography/elevation-grid.ts`:
  - Computes elevation contours for the active site boundary and surrounding buffer using Open-Meteo Elevation API / elevation grid sampling.
  - Marching-squares or GeoJSON contour line generator producing isolines at customizable intervals (e.g. 5m, 10m, 25m).
  - Renders vector contour lines directly on MapLibre or via high-performance SVG canvas layer with hypsometric stroke colors.
  - Dynamic interactive Elevation Legend card showing elevation range, interval, and colormap.
  - Layer toggle switch in the HUD to enable/disable contour overlay and elevation heatmap.

### Phase 5: Verification, Tests & Performance Gate
- Verify that all 59 existing automated tests in `src/data-providers/providers.test.ts`, `src/geometry/acceptance.test.ts`, `src/geometry/geometry.test.ts`, and `src/geometry/lifecycle.test.ts` continue to pass.
- Add unit tests for topographic contour calculation and hypsometric elevation mapping.
- Execute `npm run lint` (`tsc --noEmit`), `npm run test` (`vitest run`), and `npm run build` (`vite build`).

---

## 3. Strict Quality & Preservation Guarantees
- **No Mock GIS**: Real ellipsoidal geodesic calculations (GeographicLib), Proj4 UTM conversions, and live Open-Meteo elevation data are preserved without approximation.
- **Zero Monospace UI**: All UI elements strictly utilize Inter with `tabular-nums` for numerical data.
- **Coordinate Integrity**: Dynamic hemisphere indicators (`N`/`S`, `E`/`W`) and DMS rollover protection are maintained.
- **Performance**: 2D/2.5D GPU-accelerated rendering without unnecessary rerenders or unneeded heavy 3D overhead.
