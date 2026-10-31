/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Robust Spatial Filtering & Geometry Intersection (M2.0.2)
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
 * Tests if point p lies on segment ab (with tolerance)
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
 * 2. Boundary edge crosses outer ring.
 * 3. Boundary edge crosses any hole ring.
 * 4. Hole vertex inside boundary (hole mass intersects site).
 * 5. Boundary inside outer ring (enclosure), unless boundary is entirely enclosed in an interior hole.
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

  // 2. Any outer edge crosses boundary
  if (isLineCrossingRing(outerRing, boundaryRing)) {
    return true;
  }

  const innerRings = polygonCoords.slice(1);

  // 3. Any boundary edge crosses any hole ring
  for (const hole of innerRings) {
    if (isLineCrossingRing(boundaryRing, hole)) {
      return true;
    }
  }

  // 4. Any hole vertex inside boundary
  for (const hole of innerRings) {
    if (hole.some(pt => isPointInPolygon(pt, boundaryRing))) {
      return true;
    }
  }

  // 5. Boundary inside outer ring (enclosing polygon)
  const boundaryPointsInsideOuter = boundaryRing.filter(pt => isPointInPolygon(pt, outerRing));
  if (boundaryPointsInsideOuter.length > 0) {
    if (innerRings.length === 0) {
      return true;
    }

    // If every boundary point is inside one specific hole and no edges cross, it sits in the courtyard void
    const isEntirelyInHole = innerRings.some(hole => 
      boundaryRing.every(pt => isPointInPolygon(pt, hole))
    );

    if (!isEntirelyInHole) {
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
 * Sequence-aware antimeridian detection for a single ring or LineString.
 * Detects if adjacent coordinates jump by > 180 degrees.
 */
export function ringCrossesAntimeridian(coords: [number, number][]): boolean {
  if (!coords || coords.length < 2) return false;
  for (let i = 1; i < coords.length; i++) {
    if (Math.abs(coords[i][0] - coords[i - 1][0]) > 180) {
      return true;
    }
  }
  return false;
}

/**
 * Detects if any ring in a geometry crosses the antimeridian
 */
export function hasAntimeridianCrossing(coords: any): boolean {
  if (!coords || !Array.isArray(coords) || coords.length === 0) return false;

  // Single ring / LineString
  if (typeof coords[0]?.[0] === 'number') {
    return ringCrossesAntimeridian(coords as [number, number][]);
  }

  // Array of rings or array of polygons
  return coords.some((sub: any) => hasAntimeridianCrossing(sub));
}

/**
 * Sequence-aware antimeridian unwrapping for a single ring or LineString.
 * Compares each point to its immediate predecessor.
 * Normalizes jumps greater than 180 degrees without sharing state across rings.
 * Never mutates input coordinates.
 */
export function unwrapRingAntimeridian(coords: [number, number][]): [number, number][] {
  if (!coords || coords.length === 0) return [];
  const result: [number, number][] = [[coords[0][0], coords[0][1]]];
  let offset = 0;

  for (let i = 1; i < coords.length; i++) {
    const prevLng = result[i - 1][0];
    let curLng = coords[i][0] + offset;
    const diff = curLng - prevLng;

    if (diff > 180) {
      offset -= 360;
      curLng -= 360;
    } else if (diff < -180) {
      offset += 360;
      curLng += 360;
    }

    result.push([curLng, coords[i][1]]);
  }

  return result;
}

/**
 * Aligns a ring's average longitude with a reference longitude within [-180, +180]
 */
function alignRingToRef(ring: [number, number][], refLng: number): [number, number][] {
  if (ring.length === 0) return ring;
  const avgLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  let shift = 0;
  if (avgLng - refLng > 180) shift = -360;
  else if (avgLng - refLng < -180) shift = 360;

  if (shift === 0) return ring;
  return ring.map(p => [p[0] + shift, p[1]]);
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
 * - MultiPolygons: Disjoint polygon components evaluated independently
 * - Antimeridian: Sequence-aware unwrapping per ring without cross-ring state pollution
 */
export function filterFeaturesBySiteBoundary(
  features: Feature[],
  boundaryRing: [number, number][]
): Feature[] {
  if (!boundaryRing || boundaryRing.length < 3) return features;

  const boundaryCrosses = ringCrossesAntimeridian(boundaryRing);
  const effectiveBoundaryRing = boundaryCrosses 
    ? unwrapRingAntimeridian(boundaryRing) 
    : boundaryRing;
  const boundaryBBox = computeRingBBox(effectiveBoundaryRing);
  const boundaryCenterLng = (boundaryBBox[0] + boundaryBBox[2]) / 2;

  return features.filter(feature => {
    if (!feature.geometry) return false;

    const geom = feature.geometry;
    const geomCoords = 'coordinates' in geom ? (geom as any).coordinates : null;
    const geomCrosses = geomCoords ? hasAntimeridianCrossing(geomCoords) : false;

    // Fast BBox rejection when antimeridian handling is not active
    if (!boundaryCrosses && !geomCrosses) {
      const featBBox = computeGeometryBBox(geom);
      if (!featBBox || !isBBoxIntersecting(boundaryBBox, featBBox)) {
        return false;
      }
    }

    // 1. Point
    if (geom.type === 'Point') {
      let pt: [number, number] = [geom.coordinates[0], geom.coordinates[1]];
      if (boundaryCrosses) {
        if (pt[0] - boundaryCenterLng > 180) pt = [pt[0] - 360, pt[1]];
        else if (pt[0] - boundaryCenterLng < -180) pt = [pt[0] + 360, pt[1]];
      }
      return isPointInPolygon(pt, effectiveBoundaryRing);
    }

    // 2. LineString
    if (geom.type === 'LineString') {
      let coords = geom.coordinates as [number, number][];
      coords = unwrapRingAntimeridian(coords);
      coords = alignRingToRef(coords, boundaryCenterLng);

      if (coords.some(pt => isPointInPolygon(pt, effectiveBoundaryRing))) {
        return true;
      }
      return isLineCrossingRing(coords, effectiveBoundaryRing);
    }

    // 3. MultiLineString
    if (geom.type === 'MultiLineString') {
      const lines = geom.coordinates as [number, number][][];
      return lines.some(line => {
        let coords = unwrapRingAntimeridian(line);
        coords = alignRingToRef(coords, boundaryCenterLng);
        return coords.some(pt => isPointInPolygon(pt, effectiveBoundaryRing)) ||
          isLineCrossingRing(coords, effectiveBoundaryRing);
      });
    }

    // 4. Polygon
    if (geom.type === 'Polygon') {
      const rings = geom.coordinates as [number, number][][];
      const normalizedRings = rings.map(ring => {
        const unwrapped = unwrapRingAntimeridian(ring);
        return alignRingToRef(unwrapped, boundaryCenterLng);
      });
      return polygonIntersectsBoundary(normalizedRings, effectiveBoundaryRing);
    }

    // 5. MultiPolygon
    if (geom.type === 'MultiPolygon') {
      const multiPolys = geom.coordinates as [number, number][][][];
      return multiPolys.some(poly => {
        const normalizedRings = poly.map(ring => {
          const unwrapped = unwrapRingAntimeridian(ring);
          return alignRingToRef(unwrapped, boundaryCenterLng);
        });
        return polygonIntersectsBoundary(normalizedRings, effectiveBoundaryRing);
      });
    }

    return false;
  });
}
