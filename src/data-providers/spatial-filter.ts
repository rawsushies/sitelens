/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Robust Spatial Filtering & Geometry Intersection (M2.0.1)
 */

import { BoundingBox } from './types';
import type { Feature, Geometry } from 'geojson';

/**
 * Standard ray-casting point-in-polygon test
 * Coordinates format: [longitude, latitude]
 */
export function isPointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  if (!ring || ring.length < 3) return false;

  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Orientation helper for line intersection (2D cross product)
 */
function ccw(p1: [number, number], p2: [number, number], p3: [number, number]): number {
  return (p3[1] - p1[1]) * (p2[0] - p1[0]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
}

/**
 * Tests if point p lies on segment ab
 */
function onSegment(p: [number, number], a: [number, number], b: [number, number]): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) - 1e-10 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-10 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-10 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-10
  );
}

/**
 * Tests if segment p1-p2 and segment p3-p4 intersect
 */
export function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number]
): boolean {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);

  if (((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) &&
      ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))) {
    return true;
  }

  // Collinear or endpoint cases
  if (Math.abs(d1) <= 1e-12 && onSegment(p1, p3, p4)) return true;
  if (Math.abs(d2) <= 1e-12 && onSegment(p2, p3, p4)) return true;
  if (Math.abs(d3) <= 1e-12 && onSegment(p3, p1, p2)) return true;
  if (Math.abs(d4) <= 1e-12 && onSegment(p4, p1, p2)) return true;

  return false;
}

/**
 * Checks if a polyline crosses a polygon ring
 */
export function isLineCrossingRing(
  lineCoords: [number, number][],
  ring: [number, number][]
): boolean {
  if (lineCoords.length < 2 || ring.length < 2) return false;

  for (let i = 0; i < lineCoords.length - 1; i++) {
    const l1 = lineCoords[i];
    const l2 = lineCoords[i + 1];
    for (let j = 0; j < ring.length - 1; j++) {
      const r1 = ring[j];
      const r2 = ring[j + 1];
      if (segmentsIntersect(l1, l2, r1, r2)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Robust Polygon-to-Boundary Intersection:
 * 1. Polygon vertex inside boundary.
 * 2. Boundary vertex inside polygon outer ring (and not within holes).
 * 3. Any polygon edge crosses any boundary edge.
 */
export function polygonIntersectsBoundary(
  polygonCoords: [number, number][][], // [outerRing, ...innerRings]
  boundaryRing: [number, number][]
): boolean {
  const outerRing = polygonCoords[0];
  if (!outerRing || outerRing.length < 3) return false;

  // 1. Any polygon vertex inside boundary
  if (outerRing.some(pt => isPointInPolygon(pt, boundaryRing))) {
    return true;
  }

  // 2. Any boundary vertex inside polygon outer ring (enclosing polygon)
  const boundaryPointsInsideOuter = boundaryRing.filter(pt => isPointInPolygon(pt, outerRing));
  if (boundaryPointsInsideOuter.length > 0) {
    const innerRings = polygonCoords.slice(1);
    // If boundary is entirely inside a hole (e.g. courtyard), it does not intersect the building mass
    const isEntirelyInHole = innerRings.some(hole => 
      boundaryPointsInsideOuter.every(pt => isPointInPolygon(pt, hole))
    );
    if (!isEntirelyInHole) {
      return true;
    }
  }

  // 3. Edges intersect
  if (isLineCrossingRing(outerRing, boundaryRing)) {
    return true;
  }

  // 4. Edges of holes intersect boundary
  for (const innerRing of polygonCoords.slice(1)) {
    if (isLineCrossingRing(boundaryRing, innerRing)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if two 2D bounding boxes intersect
 * BoundingBox: [minLng, minLat, maxLng, maxLat]
 */
export function isBBoxIntersecting(bbox1: BoundingBox, bbox2: BoundingBox): boolean {
  return !(
    bbox1[2] < bbox2[0] || // bbox1 maxLng < bbox2 minLng
    bbox1[0] > bbox2[2] || // bbox1 minLng > bbox2 maxLng
    bbox1[3] < bbox2[1] || // bbox1 maxLat < bbox2 minLat
    bbox1[1] > bbox2[3]    // bbox1 minLat > bbox2 maxLat
  );
}

/**
 * Detects if a coordinate set crosses the 180th meridian (Antimeridian)
 */
export function hasAntimeridianCrossing(coords: any): boolean {
  let prevLng: number | null = null;
  let crossed = false;

  function walk(c: any) {
    if (crossed) return;
    if (typeof c[0] === 'number') {
      const lng = c[0];
      if (prevLng !== null) {
        if (Math.abs(lng - prevLng) > 180) {
          crossed = true;
          return;
        }
      }
      prevLng = lng;
    } else if (Array.isArray(c)) {
      for (const item of c) walk(item);
    }
  }

  walk(coords);
  return crossed;
}

/**
 * Unwraps longitudes across the antimeridian into continuous domain [0, 360)
 */
export function unwrapAntimeridianCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat]);
}

/**
 * Computes bounding box for an arbitrary GeoJSON geometry
 */
export function computeGeometryBBox(geom: Geometry): BoundingBox | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  function processCoord(coord: number[]) {
    if (coord.length >= 2) {
      const [lng, lat] = coord;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }

  function walk(coords: any) {
    if (typeof coords[0] === 'number') {
      processCoord(coords);
    } else {
      for (const item of coords) {
        walk(item);
      }
    }
  }

  if ('coordinates' in geom && geom.coordinates) {
    walk(geom.coordinates);
  }

  if (minLng === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Computes bounding box for a polygon ring
 */
export function computeRingBBox(ring: [number, number][]): BoundingBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Filters GeoJSON features by site boundary using comprehensive geometry intersection:
 * - Points: Ray-casting containment
 * - LineStrings: Vertex inside OR line crossing boundary ring
 * - Polygons: Vertex inside OR boundary inside polygon (enclosure) OR edges crossing, respecting holes
 * - MultiPolygons: Disjoint polygon components evaluated
 * - Antimeridian: Detects crossing and safely unwraps coordinates
 */
export function filterFeaturesBySiteBoundary(
  features: Feature[],
  boundaryRing: [number, number][]
): Feature[] {
  if (!boundaryRing || boundaryRing.length < 3) return features;

  const boundaryCrossesAntimeridian = hasAntimeridianCrossing(boundaryRing);
  const effectiveBoundaryRing = boundaryCrossesAntimeridian 
    ? unwrapAntimeridianCoords(boundaryRing) 
    : boundaryRing;
  const boundaryBBox = computeRingBBox(effectiveBoundaryRing);

  return features.filter(feature => {
    if (!feature.geometry) return false;

    const geom = feature.geometry;
    const geomCrossesAntimeridian = hasAntimeridianCrossing(geom);

    // Fast check: BBox intersection (skip if antimeridian handling applies)
    if (!boundaryCrossesAntimeridian && !geomCrossesAntimeridian) {
      const featBBox = computeGeometryBBox(geom);
      if (!featBBox || !isBBoxIntersecting(boundaryBBox, featBBox)) {
        return false;
      }
    }

    // 1. Point
    if (geom.type === 'Point') {
      let pt = geom.coordinates as [number, number];
      if (boundaryCrossesAntimeridian && pt[0] < 0) pt = [pt[0] + 360, pt[1]];
      return isPointInPolygon(pt, effectiveBoundaryRing);
    }

    // 2. LineString
    if (geom.type === 'LineString') {
      let coords = geom.coordinates as [number, number][];
      if (boundaryCrossesAntimeridian) coords = unwrapAntimeridianCoords(coords);

      // Check vertex containment
      if (coords.some(pt => isPointInPolygon(pt, effectiveBoundaryRing))) {
        return true;
      }
      // Check segment-segment crossing
      return isLineCrossingRing(coords, effectiveBoundaryRing);
    }

    // 3. MultiLineString
    if (geom.type === 'MultiLineString') {
      const lines = geom.coordinates as [number, number][][];
      return lines.some(line => {
        let coords = line;
        if (boundaryCrossesAntimeridian) coords = unwrapAntimeridianCoords(coords);
        return coords.some(pt => isPointInPolygon(pt, effectiveBoundaryRing)) ||
          isLineCrossingRing(coords, effectiveBoundaryRing);
      });
    }

    // 4. Polygon
    if (geom.type === 'Polygon') {
      let polyCoords = geom.coordinates as [number, number][][];
      if (boundaryCrossesAntimeridian) {
        polyCoords = polyCoords.map(ring => unwrapAntimeridianCoords(ring));
      }
      return polygonIntersectsBoundary(polyCoords, effectiveBoundaryRing);
    }

    // 5. MultiPolygon
    if (geom.type === 'MultiPolygon') {
      const multiPolys = geom.coordinates as [number, number][][][];
      return multiPolys.some(poly => {
        let polyCoords = poly;
        if (boundaryCrossesAntimeridian) {
          polyCoords = polyCoords.map(ring => unwrapAntimeridianCoords(ring));
        }
        return polygonIntersectsBoundary(polyCoords, effectiveBoundaryRing);
      });
    }

    return false;
  });
}
