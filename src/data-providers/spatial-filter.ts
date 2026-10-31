/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Spatial Filtering & Containment (M2.0)
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
 * Filters GeoJSON features by site boundary containment or intersection
 */
export function filterFeaturesBySiteBoundary(
  features: Feature[],
  boundaryRing: [number, number][]
): Feature[] {
  if (!boundaryRing || boundaryRing.length < 3) return features;

  const boundaryBBox = computeRingBBox(boundaryRing);

  return features.filter(feature => {
    if (!feature.geometry) return false;

    // Fast check: BBox intersection
    const featBBox = computeGeometryBBox(feature.geometry);
    if (!featBBox || !isBBoxIntersecting(boundaryBBox, featBBox)) {
      return false;
    }

    // Exact check based on geometry type
    if (feature.geometry.type === 'Point') {
      return isPointInPolygon(feature.geometry.coordinates as [number, number], boundaryRing);
    }

    if (feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates as [number, number][];
      // Keep if any vertex is inside the boundary
      return coords.some(pt => isPointInPolygon(pt, boundaryRing));
    }

    if (feature.geometry.type === 'Polygon') {
      const ring = feature.geometry.coordinates[0] as [number, number][];
      if (!ring || ring.length < 3) return false;
      // Keep if any vertex of polygon is inside boundary or centroid is inside
      return ring.some(pt => isPointInPolygon(pt, boundaryRing));
    }

    if (feature.geometry.type === 'MultiPolygon') {
      const polys = feature.geometry.coordinates as [number, number][][][];
      return polys.some(poly => {
        const ring = poly[0];
        return ring && ring.some(pt => isPointInPolygon(pt, boundaryRing));
      });
    }

    return true;
  });
}
