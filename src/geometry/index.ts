/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Geometry & Geodesy Engine
 */

import { Geodesic } from 'geographiclib-geodesic';
import { 
  PolygonAnalysis, 
  LineAnalysis, 
  ProvenancedMetric, 
  CoordinateReport 
} from '../types';
import { inspectCoordinates } from '../coordinates';

const geod = Geodesic.WGS84;

/**
 * Calculates geodesic distance and bearings between two [lng, lat] points on WGS84
 */
export function calculateGeodesicDistance(
  p1: [number, number],
  p2: [number, number]
): {
  distanceM: number;
  initialAzimuthDeg: number;
  finalAzimuthDeg: number;
} {
  const [lon1, lat1] = p1;
  const [lon2, lat2] = p2;
  const result = geod.Inverse(lat1, lon1, lat2, lon2);
  return {
    distanceM: Math.abs(result.s12 || 0),
    initialAzimuthDeg: (result.azi1 !== undefined && result.azi1 < 0) ? result.azi1 + 360 : (result.azi1 || 0),
    finalAzimuthDeg: (result.azi2 !== undefined && result.azi2 < 0) ? result.azi2 + 360 : (result.azi2 || 0),
  };
}

/**
 * Calculates line analysis across multi-vertex coordinates [[lng, lat], ...]
 */
export function analyzeLine(coordinates: [number, number][]): LineAnalysis {
  if (coordinates.length < 2) {
    return {
      totalDistanceM: 0,
      totalDistanceKm: 0,
      initialBearingDeg: 0,
      finalBearingDeg: 0,
      segmentCount: 0,
      segments: [],
      metrics: {},
    };
  }

  let totalDistanceM = 0;
  const segments: LineAnalysis['segments'] = [];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const start = coordinates[i];
    const end = coordinates[i + 1];
    const { distanceM, initialAzimuthDeg } = calculateGeodesicDistance(start, end);
    totalDistanceM += distanceM;
    segments.push({
      index: i + 1,
      start,
      end,
      distanceM,
      initialAzimuthDeg,
    });
  }

  const overall = calculateGeodesicDistance(coordinates[0], coordinates[coordinates.length - 1]);
  const totalDistanceKm = totalDistanceM / 1000;

  const metrics: Record<string, ProvenancedMetric> = {
    line_total_length: {
      id: 'metric-line-dist',
      name: 'geodesic_length',
      label: 'Total Geodesic Length',
      value: Number(totalDistanceM.toFixed(3)),
      formattedValue: totalDistanceM >= 1000 ? `${totalDistanceKm.toFixed(3)} km` : `${totalDistanceM.toFixed(2)} m`,
      unit: totalDistanceM >= 1000 ? 'km' : 'm',
      classification: 'geometry-derived',
      source: 'GeographicLib Geodesic (Charles Karney algorithm)',
      calculationMethod: 'Exact ellipsoidal geodesic inverse solution on WGS84 (semi-major axis a=6378137m, flattening f=1/298.257223563)',
      spatialResolution: 'Sub-millimetre ellipsoidal precision',
      timestampOrReferencePeriod: 'WGS84 Reference Epoch',
      limitations: 'Calculated along the sea-level ellipsoidal surface; slope distance will be greater on steep terrain unless coupled with high-resolution DEM.',
      category: 'geometry'
    },
    line_initial_bearing: {
      id: 'metric-line-bearing',
      name: 'initial_bearing',
      label: 'Initial Geodetic Azimuth',
      value: Number(overall.initialAzimuthDeg.toFixed(2)),
      formattedValue: `${overall.initialAzimuthDeg.toFixed(2)}°`,
      unit: '°',
      classification: 'geometry-derived',
      source: 'GeographicLib Geodesic',
      calculationMethod: 'Azimuth of geodesic from first vertex towards subsequent vertices',
      spatialResolution: '0.01 degree',
      timestampOrReferencePeriod: 'True North (Geodetic)',
      limitations: 'Measured clockwise relative to True Geodetic North; does not account for local magnetic declination or grid convergence.',
      category: 'geometry'
    }
  };

  return {
    totalDistanceM: Number(totalDistanceM.toFixed(3)),
    totalDistanceKm: Number(totalDistanceKm.toFixed(4)),
    initialBearingDeg: Number(overall.initialAzimuthDeg.toFixed(2)),
    finalBearingDeg: Number(overall.finalAzimuthDeg.toFixed(2)),
    segmentCount: segments.length,
    segments,
    metrics,
  };
}

/**
 * Checks if two line segments (p1->p2) and (p3->p4) intersect in 2D
 */
function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number]
): boolean {
  const ccw = (a: [number, number], b: [number, number], c: [number, number]) => {
    return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  };

  const a = p1, b = p2, c = p3, d = p4;
  return (ccw(a, c, d) !== ccw(b, c, d)) && (ccw(a, b, c) !== ccw(a, b, d));
}

/**
 * Validates whether a polygon ring has self-intersecting edges (Bowtie polygon)
 */
export function checkPolygonSelfIntersection(ring: [number, number][]): {
  isSelfIntersecting: boolean;
  intersectionCount: number;
} {
  // A polygon ring must have at least 4 coordinates (3 unique vertices + closed endpoint)
  const len = ring.length;
  if (len < 4) {
    return { isSelfIntersecting: false, intersectionCount: 0 };
  }

  // Ensure closed ring
  const points = [...ring];
  if (points[0][0] !== points[len - 1][0] || points[0][1] !== points[len - 1][1]) {
    points.push(points[0]);
  }

  const numEdges = points.length - 1;
  let count = 0;

  for (let i = 0; i < numEdges; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    for (let j = i + 1; j < numEdges; j++) {
      // Skip adjacent edges
      if (Math.abs(i - j) <= 1) continue;
      // Skip first and last edge connecting at index 0
      if (i === 0 && j === numEdges - 1) continue;

      const p3 = points[j];
      const p4 = points[j + 1];

      if (segmentsIntersect(p1, p2, p3, p4)) {
        count++;
      }
    }
  }

  return {
    isSelfIntersecting: count > 0,
    intersectionCount: count,
  };
}

/**
 * Calculates spherical centroid of geographic coordinates
 */
export function calculateSphericalCentroid(ring: [number, number][]): [number, number] {
  if (ring.length === 0) return [0, 0];

  let x = 0;
  let y = 0;
  let z = 0;
  const count = (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
    ? ring.length - 1
    : ring.length;

  for (let i = 0; i < count; i++) {
    const lonRad = (ring[i][0] * Math.PI) / 180;
    const latRad = (ring[i][1] * Math.PI) / 180;

    x += Math.cos(latRad) * Math.cos(lonRad);
    y += Math.cos(latRad) * Math.sin(lonRad);
    z += Math.sin(latRad);
  }

  x /= count;
  y /= count;
  z /= count;

  const lon = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);

  return [
    Number(((lon * 180) / Math.PI).toFixed(7)),
    Number(((lat * 180) / Math.PI).toFixed(7)),
  ];
}

/**
 * Performs rigorous WGS84 ellipsoidal analysis on a polygon coordinate ring
 */
export function analyzePolygon(ringCoordinates: [number, number][]): PolygonAnalysis {
  // Normalize ring: ensure closed
  const points = [...ringCoordinates];
  if (points.length < 3) {
    throw new Error('Polygon must contain at least 3 vertices');
  }

  const isClosed = 
    points[0][0] === points[points.length - 1][0] && 
    points[0][1] === points[points.length - 1][1];

  if (!isClosed) {
    points.push(points[0]);
  }

  // 1. Calculate WGS84 Ellipsoidal Area and Perimeter using GeographicLib
  const poly = geod.Polygon(false); // false = polygon (enclosed area)
  for (let i = 0; i < points.length - 1; i++) {
    poly.AddPoint(points[i][1], points[i][0]); // AddPoint(lat, lon)
  }
  const polyResult = poly.Compute(false, true);

  const ellipsoidalAreaSqM = Math.abs(polyResult.area || 0);
  const ellipsoidalPerimeterM = Math.abs(polyResult.perimeter || 0);
  const ellipsoidalAreaHectares = ellipsoidalAreaSqM / 10000;
  const ellipsoidalAreaAcres = ellipsoidalAreaSqM * 0.000247105;

  // 2. Centroid calculation
  const centroid = calculateSphericalCentroid(points);

  // 3. Vertices reports and segment metrics
  const vertexReports: CoordinateReport[] = [];
  const segments: PolygonAnalysis['segments'] = [];

  for (let i = 0; i < points.length - 1; i++) {
    vertexReports.push(inspectCoordinates(points[i][0], points[i][1]));

    const start = points[i];
    const end = points[i + 1];
    const { distanceM, initialAzimuthDeg, finalAzimuthDeg } = calculateGeodesicDistance(start, end);
    segments.push({
      index: i + 1,
      start,
      end,
      distanceM: Number(distanceM.toFixed(3)),
      initialAzimuthDeg: Number(initialAzimuthDeg.toFixed(2)),
      finalAzimuthDeg: Number(finalAzimuthDeg.toFixed(2)),
    });
  }

  // 4. Bounding Box & Spans
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const pt of points) {
    if (pt[0] < minLng) minLng = pt[0];
    if (pt[0] > maxLng) maxLng = pt[0];
    if (pt[1] < minLat) minLat = pt[1];
    if (pt[1] > maxLat) maxLat = pt[1];
  }

  // North-South geodesic span along central meridian
  const midLng = (minLng + maxLng) / 2;
  const nsResult = geod.Inverse(minLat, midLng, maxLat, midLng);
  const northSouthSpanM = Math.abs(nsResult.s12 || 0);

  // East-West geodesic span along central parallel
  const midLat = (minLat + maxLat) / 2;
  const ewResult = geod.Inverse(midLat, minLng, midLat, maxLng);
  const eastWestSpanM = Math.abs(ewResult.s12 || 0);

  // 5. Self-intersection validation
  const { isSelfIntersecting, intersectionCount } = checkPolygonSelfIntersection(points);

  // 6. Provenanced Metrics creation
  const metrics: Record<string, ProvenancedMetric> = {
    ellipsoidal_area: {
      id: 'poly-area-sqm',
      name: 'ellipsoidal_area',
      label: 'True Ellipsoidal Site Area',
      value: Number(ellipsoidalAreaSqM.toFixed(2)),
      formattedValue: `${ellipsoidalAreaSqM.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} m²`,
      unit: 'm²',
      classification: 'geometry-derived',
      source: 'GeographicLib Geodesic Engine (Karney 2013)',
      calculationMethod: 'Exact ellipsoidal polygon surface integral on WGS84 reference ellipsoid (GRS80 compatible)',
      spatialResolution: 'Sub-millimetre geodesic precision',
      timestampOrReferencePeriod: 'WGS84 Reference Epoch',
      limitations: 'Represents planimetric horizontal surface on the WGS84 ellipsoid. Does not account for vertical terrain micro-topography; actual 3D slope surface area will be slightly greater.',
      warning: isSelfIntersecting ? 'Self-intersecting polygon boundary detected (bowtie geometry). Area calculation may be compromised until vertices are adjusted.' : undefined,
      category: 'geometry'
    },
    area_hectares: {
      id: 'poly-area-ha',
      name: 'area_hectares',
      label: 'Site Area (Hectares)',
      value: Number(ellipsoidalAreaHectares.toFixed(4)),
      formattedValue: `${ellipsoidalAreaHectares.toFixed(4)} ha`,
      unit: 'ha',
      classification: 'geometry-derived',
      source: 'GeographicLib Geodesic',
      calculationMethod: 'Mathematical scaling: Area (m²) / 10,000',
      spatialResolution: '0.0001 ha',
      timestampOrReferencePeriod: 'WGS84',
      limitations: 'Horizontal ellipsoidal projection.',
      category: 'geometry'
    },
    area_acres: {
      id: 'poly-area-ac',
      name: 'area_acres',
      label: 'Site Area (Acres)',
      value: Number(ellipsoidalAreaAcres.toFixed(3)),
      formattedValue: `${ellipsoidalAreaAcres.toFixed(3)} acres`,
      unit: 'acres',
      classification: 'geometry-derived',
      source: 'GeographicLib Geodesic',
      calculationMethod: 'International acre conversion factor (1 m² = 0.000247105 acres)',
      spatialResolution: '0.001 acres',
      timestampOrReferencePeriod: 'WGS84',
      limitations: 'Horizontal projection.',
      category: 'geometry'
    },
    ellipsoidal_perimeter: {
      id: 'poly-perimeter',
      name: 'ellipsoidal_perimeter',
      label: 'Ellipsoidal Boundary Perimeter',
      value: Number(ellipsoidalPerimeterM.toFixed(2)),
      formattedValue: `${ellipsoidalPerimeterM.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} m`,
      unit: 'm',
      classification: 'geometry-derived',
      source: 'GeographicLib Geodesic',
      calculationMethod: 'Sum of geodesic inverse line lengths between consecutive ring vertices on WGS84',
      spatialResolution: 'Sub-millimetre precision',
      timestampOrReferencePeriod: 'WGS84',
      limitations: 'Planimetric 2D boundary perimeter.',
      category: 'geometry'
    },
    vertex_count: {
      id: 'poly-vertices',
      name: 'vertex_count',
      label: 'Boundary Vertices',
      value: points.length - 1,
      formattedValue: `${points.length - 1} vertices`,
      unit: 'count',
      classification: 'geometry-derived',
      source: 'User Input / Vector Geometry',
      calculationMethod: 'Discrete boundary node enumeration',
      spatialResolution: 'Exact node count',
      timestampOrReferencePeriod: 'Current Edit Session',
      limitations: 'Discrete approximation of site boundary.',
      category: 'geometry'
    },
    bbox_ew_span: {
      id: 'bbox-ew-span',
      name: 'bbox_ew_span',
      label: 'BBox East-West Envelope Span',
      value: Number(eastWestSpanM.toFixed(2)),
      formattedValue: `${eastWestSpanM.toFixed(2)} m (BBox Envelope)`,
      unit: 'm',
      classification: 'geometry-derived',
      source: 'Axis-Aligned Geodesic Envelope',
      calculationMethod: 'Geodesic inverse distance along mid-latitude parallel between min and max longitude',
      spatialResolution: '1 cm',
      timestampOrReferencePeriod: 'WGS84',
      limitations: 'NOT a true site dimension. Represents the bounding rectangle width. For true site widths, use a drawn transect.',
      warning: 'Notice: This is an axis-aligned envelope span, NOT the true physical parcel width.',
      category: 'geometry'
    },
    bbox_ns_span: {
      id: 'bbox-ns-span',
      name: 'bbox_ns_span',
      label: 'BBox North-South Envelope Span',
      value: Number(northSouthSpanM.toFixed(2)),
      formattedValue: `${northSouthSpanM.toFixed(2)} m (BBox Envelope)`,
      unit: 'm',
      classification: 'geometry-derived',
      source: 'Axis-Aligned Geodesic Envelope',
      calculationMethod: 'Geodesic inverse distance along mid-longitude meridian between min and max latitude',
      spatialResolution: '1 cm',
      timestampOrReferencePeriod: 'WGS84',
      limitations: 'NOT a true site dimension. Represents the bounding rectangle height. For true site depths, use a drawn transect.',
      warning: 'Notice: This is an axis-aligned envelope span, NOT the true physical parcel depth.',
      category: 'geometry'
    },
    self_intersection_status: {
      id: 'poly-self-intersection',
      name: 'self_intersection',
      label: 'Topology Integrity',
      value: isSelfIntersecting ? `Invalid (${intersectionCount} intersection${intersectionCount > 1 ? 's' : ''})` : 'Valid Simple Polygon',
      formattedValue: isSelfIntersecting ? `Invalid (${intersectionCount} crossings)` : 'Valid (Clean Simple Ring)',
      unit: 'boolean',
      classification: 'geometry-derived',
      source: 'Segment-Segment CCW Crossing Intersector',
      calculationMethod: 'Exhaustive edge pair intersection testing excluding adjacent vertices',
      spatialResolution: 'Exact',
      timestampOrReferencePeriod: 'Current State',
      limitations: 'Detects self-intersecting boundary edges.',
      warning: isSelfIntersecting ? 'Self-intersection detected! Please adjust vertices to resolve boundary overlap.' : undefined,
      category: 'geometry'
    }
  };

  return {
    ellipsoidalAreaSqM: Number(ellipsoidalAreaSqM.toFixed(2)),
    ellipsoidalAreaHectares: Number(ellipsoidalAreaHectares.toFixed(4)),
    ellipsoidalAreaAcres: Number(ellipsoidalAreaAcres.toFixed(3)),
    ellipsoidalPerimeterM: Number(ellipsoidalPerimeterM.toFixed(2)),
    centroid,
    vertexCount: points.length - 1,
    vertices: vertexReports,
    bbox: {
      minLng,
      minLat,
      maxLng,
      maxLat,
      eastWestSpanM: Number(eastWestSpanM.toFixed(2)),
      northSouthSpanM: Number(northSouthSpanM.toFixed(2)),
    },
    isSelfIntersecting,
    segments,
    metrics,
  };
}
