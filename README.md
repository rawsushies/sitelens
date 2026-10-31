# SiteLens — Geospatial Site Intelligence Workstation

SiteLens is a modular, all-in-one geospatial site intelligence workstation designed for architects, BIM professionals, urban planners, landscape architects, and environmental designers.

It enables designers to interrogate real geographic sites before making irreversible design commitments, combining interactive GIS, architectural site analysis, environmental intelligence, and urban morphology.

---

## 🏛 Product Philosophy

1. **Engineering Tool, Not a Generic Dashboard**: SiteLens is designed as an architectural CAD/GIS precision tool.
2. **Accuracy Over Cosmetic Fluff**: Calculations avoid Web Mercator planar distortion for area calculations and do not perform crude latitude/longitude Euclidean subtractions.
3. **Strict Scientific Provenance**: Every analytical result identifies its:
   - **Source**: Datasets, reference ellipsoids, API origins
   - **Calculation Method**: Specific algorithms (e.g., Karney 2013, Jean Meeus astronomical algorithms)
   - **Units**: Standard SI & survey units (m², ha, acres, m, km, °, °C, km/h)
   - **Spatial Resolution**: Numerical grid or polygon precision
   - **Reference Period / Timestamp**: Epoch or observation time
   - **Classification**: `geometry-derived`, `dataset-derived`, `model-derived`, `proxy`, or `unavailable`
   - **Limitations & Uncertainties**: Explicit disclosures of model boundaries.
4. **Zero Proprietary API Lock-in**: Powered exclusively by open-source GIS engines, open basemaps (OpenFreeMap, Carto, OpenTopo), and open data services (Photon, Nominatim, Open-Meteo, OpenStreetMap Overpass).

---

## 📐 Geodetic & Geometric Engine

### WGS84 Ellipsoidal Area & Perimeter
Standard Web Mercator (`EPSG:3857`) introduces area inflation as latitude increases (over +100% inflation at high latitudes). SiteLens evaluates polygon area directly on the **WGS84 Reference Ellipsoid** ($a = 6,378,137.0\,\text{m}$, $f = 1 / 298.257223563$) using **GeographicLib** (`geographiclib-geodesic`), implementing Charles Karney’s exact geodesic polygon surface integral.

### Geodesic Distance & Azimuths
Linear measurements and polygon segments calculate the geodesic inverse solution ($s_{12}$, initial azimuth $\alpha_1$, final azimuth $\alpha_2$) on the ellipsoid with sub-millimetre precision.

### Bounding-Box Spans vs True Site Dimensions
SiteLens explicitly displays Axis-Aligned Bounding Box (AABB) spans (East-West and North-South), paired with a prominent architectural warning:
> *Bounding-box spans represent the minimum axis-aligned geographic envelope, never true parcel dimensions or perpendicular site widths.*
The application provides a dedicated **Transect Tool (T)** for defining true cross-sectional parcel width and depth measurements.

### Topology Integrity
All drawn polygon boundaries undergo automatic edge-edge intersection testing to detect **bowtie / self-intersecting** polygons, displaying a topological integrity warning in the inspector.

### Multi-Coordinate Geodetic Reporting
For every site vertex and inspection datum, coordinates are concurrently provided in:
- **WGS84 Decimal Degrees (DD)**: 7 decimal places ($~1.1\,\text{cm}$ resolution)
- **Sexagesimal DMS**: Degrees, Minutes, Seconds with hemisphere indicator
- **Projected UTM (Universal Transverse Mercator)**: Auto-computed UTM Zone (1–60), hemisphere (N/S), Easting, Northing, and official EPSG code via `proj4`.
- **Web Mercator (EPSG:3857)**: Projected metric coordinates for CAD/BIM alignment.

---

## ☀️ Environmental & Urban Intelligence

### Astronomical Solar Engine
Based on Jean Meeus astronomical algorithms and NOAA solar position formulations:
- Real-time Solar Altitude / Elevation angle
- Solar Azimuth (relative to True Geodetic North)
- Solar Zenith Angle
- Civil Sunrise, Solar Noon, and Sunset times
- Daylight Duration
- Shadow Length Multiplier ($L = H / \tan \theta$)
- 24-hour Sun Path Elevation Arc diagram

### Regional Climate Context
Connected to the **Open-Meteo Global NWP API** (ECMWF IFS / GFS numerical weather prediction ensemble):
- Ambient Air Temperature (2m AGL)
- Apparent "Feels-Like" Temperature
- Relative Humidity
- Wind Speed & Direction at 10m AGL
- Copernicus DEM 90m surface elevation reference
- *Clearly classified as `dataset-derived` regional atmospheric grid data ($11\,\text{km}$ cell), not parcel microclimate sensors.*

### Urban Context & Morphology
Connected to the **OpenStreetMap Overpass API**:
- Building footprints count within site buffer
- Surrounding road network segment enumeration
- Amenities and Points of Interest (POIs)
- Pedestrian Permeability indicator (*explicitly labelled as `proxy indicator`*).

---

## 🗂 Architectural Modules

```
src/
├── coordinates/       # Decimal degrees, DMS, UTM zone computation via Proj4
├── geometry/          # GeographicLib WGS84 geodesic area, distance, bearings, self-intersection
├── solar/             # NOAA / Jean Meeus astronomical solar engine & sun path
├── climate/           # Open-Meteo NWP climate & Copernicus elevation retrieval
├── urban-analysis/    # OpenStreetMap Overpass urban fabric & morphology queries
├── projects/          # IndexedDB persistence, GeoJSON & CSV export
├── reporting/         # Structured Site Intelligence Dossier and Markdown export
├── map/               # Basemap registry (OpenFreeMap Liberty, Dark Matter, Positron, Topographic)
├── components/
│   ├── TopBar.tsx         # Brand, search/coordinate navigation, basemap, project actions
│   ├── ToolBar.tsx        # CAD/GIS tools (Select, Pan, Polygon, Line, Transect, Point, Undo/Redo)
│   ├── MapCanvas.tsx      # MapLibre GL map, interactive vertex handles, mid-edge insert, rubberband
│   ├── InspectorPanel.tsx # Modular inspector tabs (Overview, Geometry, Coordinates, Context, Layers)
│   ├── BottomBar.tsx      # Live cursor coordinates (DD, DMS, UTM), zoom, datum
│   ├── MetricCard.tsx     # Provenance disclosure cards with classification badges
│   ├── ProjectModal.tsx   # Project manager (New, Open, Duplicate, Delete)
│   └── ReportModal.tsx    # Architectural Site Intelligence Dossier
└── types/             # Shared TypeScript schemas and ProvenancedMetric interfaces
```

---

## ⌨️ CAD/GIS Interaction & Shortcut System

| Tool / Action | Shortcut | Description | Interaction Behavior |
| :--- | :---: | :--- | :--- |
| **Select / Inspect** | `V` | Inspect feature & manipulate vertex handles | Click to select, click blank map canvas to deselect, drag vertices |
| **Pan Camera** | `H` | Free camera navigation | Click and drag map canvas |
| **Site Boundary Polygon** | `P` | Draw closed WGS84 site boundary | Click to place nodes, click start point or double-click to close |
| **Distance Polyline** | `L` | Measure multi-segment geodesic paths | Click to place nodes, double-click or Enter to finish |
| **Site Width Transect**| `T` | User-defined cross-sectional site width | Click start and end points across parcel |
| **Datum / Spot Point** | `D` | Place spot coordinate / elevation datum | Single-click places point and immediately returns to Select |
| **Cancel Drawing** | `Esc` | Cancel in-progress geometry or deselect | Clears in-progress nodes; switches to Select mode |
| **Complete Drawing** | `Enter` | Complete polygon ($\ge 3$ pts) or line ($\ge 2$ pts) | Commits geometry, computes ellipsoidal metrics, returns to Select |
| **Delete Geometry** | `Del` / `Backspace` | Delete active feature | Deletes selected feature and records to undo history |
| **Undo** | `Ctrl+Z` / `Cmd+Z` | Undo geometry operation | Single-step undo for creation, vertex moves, midpoints, and deletion |
| **Redo** | `Ctrl+Y` / `Cmd+Shift+Z`| Redo geometry operation | Restores undone actions |
| **Vertex Deletion** | Right-Click | Delete vertex from polygon/line | Right-click node handle (keeps minimum 3 nodes for polygons) |
| **Vertex Insertion** | Click `+` | Insert midpoint node | Inserts vertex between adjacent nodes and recalculates geometry |

---

## 🧪 Unit & Regression Tests

SiteLens includes 15 automated unit and regression tests running in **Vitest**:
- **Sequential Polygon & Polyline Creation**: Verifies multiple distinct polygons and lines can be created sequentially without overwriting or state corruption.
- **Tool Switching**: Clean cancellation of incomplete drawings without corrupting existing features.
- **Selection & Deselection**: Direct selection, canvas deselect, and feature switching.
- **Vertex Manipulation**: Dragging vertices dynamically updates WGS84 ellipsoidal area, perimeter, and preserves ring closure.
- **Midpoint Insertion**: Dynamically adds nodes to polygon rings and polylines with immediate measurement updates.
- **Vertex Deletion**: Removes nodes while preserving valid closed simple polygons.
- **Undo/Redo Transactions**: Verifies full multi-step history transactions for creations, moves, insertions, and deletions.
- **Geodesic Distance & Area**: Charles Karney WGS84 geodesic algorithms validated against ellipsoidal baselines.
- **Topology Integrity**: Detection of bowtie self-intersecting polygons.
- **Coordinate Reference Systems**: Sexagesimal DMS conversions, global UTM zone calculations, and Proj4 transformations.
- **Astronomical Solar Model**: Jean Meeus celestial algorithms for solar altitude, azimuth, and day length.

To run the test suite:
```bash
npm test
```

---

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Runs at `http://localhost:3000`.

### Type Checking & Linting
```bash
npm run lint
```

### Production Build
```bash
npm run build
```

---

## 📄 Implementation Report (Milestone 1 & Modular Foundations)

| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| **Interactive Map** | Completed | MapLibre GL JS with OpenFreeMap Liberty, Carto Dark Matter, Positron, and Topographic styles |
| **MapLibre Web Worker** | Completed | Inlined via in-memory Blob URL to eliminate 404 worker fetches and cross-origin sandboxed iframe issues |
| **Geocoding & Navigation** | Completed | Photon & Nominatim OpenStreetMap geocoding + direct DD/DMS coordinate parser |
| **Polygon Drawing & Editing** | Completed | Interactive vertex placement, rubberband live length/bearing, draggable vertex handles, midpoint insertion |
| **WGS84 Ellipsoidal Area** | Completed | GeographicLib exact geodesic polygon integral on GRS80/WGS84 |
| **Geodesic Distance & Bearings**| Completed | Karney inverse geodesic algorithm with initial/final azimuths |
| **Transect Width Measurement** | Completed | Dedicated user-drawn cross-section transect tool for true site widths |
| **Coordinate Systems** | Completed | WGS84 DD, DMS, and Projected UTM Zone Easting/Northing via Proj4 |
| **Topology Validation** | Completed | Edge-crossing intersection detection for bowtie geometry |
| **Project Persistence** | Completed | IndexedDB storage with save, load, rename, new, and delete confirmations |
| **Export Formats** | Completed | GeoJSON FeatureCollection, CSV Measurement Registry, Markdown Dossier |
| **Solar Engine** | Completed | Astronomical solar altitude, azimuth, sunrise/sunset, shadow multiplier, 24h arc |
| **Climate Context** | Completed | Open-Meteo NWP model integration (temp, humidity, wind, DEM elevation) |
| **Urban Morphology** | Completed | Overpass API building, road, and amenity count with proxy pedestrian indicator |
| **Undo / Redo** | Completed | 25-step geometric undo/redo history |
