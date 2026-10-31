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

## 🧪 Unit Tests

SiteLens includes unit tests implemented with **Vitest**:
- Geodesic distance on WGS84 matching known ellipsoidal baseline
- WGS84 ellipsoidal polygon area verified against benchmark geodetic quadrilaterals
- Bowtie self-intersecting polygon topology detection
- Multi-segment line analysis and forward azimuths
- Decimal degree to sexagesimal DMS conversion
- Global UTM zone determination across longitudes
- Proj4 UTM coordinate transformations
- Astronomical solar altitude, sunrise, sunset, and shadow multipliers

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
