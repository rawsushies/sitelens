/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Topographic Elevation Grid Engine
 *
 * Generates georeferenced Digital Elevation Model (DEM) surfaces and terrain relief grids
 * for client-side topographic contour extraction and hypsometric elevation intelligence.
 */

export interface ElevationGrid {
  bounds: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
  cols: number;
  rows: number;
  cellWidthDeg: number;
  cellHeightDeg: number;
  values: number[][]; // [row][col] elevation in meters ASL
  minElevationM: number;
  maxElevationM: number;
  meanElevationM: number;
  reliefM: number;
}

/**
 * Creates a synthetic geomorphological elevation grid anchored by a base elevation,
 * suitable for real-time architectural terrain analysis and contour generation.
 */
export function generateElevationGrid(
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  baseElevationM: number = 45,
  cols: number = 32,
  rows: number = 32
): ElevationGrid {
  const values: number[][] = [];
  const minLng = bounds.minLng;
  const maxLng = bounds.maxLng;
  const minLat = bounds.minLat;
  const maxLat = bounds.maxLat;

  const cellWidthDeg = (maxLng - minLng) / (cols - 1);
  const cellHeightDeg = (maxLat - minLat) / (rows - 1);

  let minElevationM = Infinity;
  let maxElevationM = -Infinity;
  let sumElevationM = 0;

  // Harmonized natural terrain relief harmonics
  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const spanLng = maxLng - minLng || 0.005;
  const spanLat = maxLat - minLat || 0.005;

  for (let r = 0; r < rows; r++) {
    values[r] = [];
    const lat = minLat + r * cellHeightDeg;
    const normY = (lat - centerLat) / spanLat;

    for (let c = 0; c < cols; c++) {
      const lng = minLng + c * cellWidthDeg;
      const normX = (lng - centerLng) / spanLng;

      // Geomorphologic ridge and valley wave functions
      const ridge1 = Math.sin(normX * 3.14 + normY * 1.5) * 14;
      const ridge2 = Math.cos(normX * 6.28 - normY * 4.71) * 6.5;
      const knoll = Math.exp(-(normX * normX + normY * normY) * 3) * 18;
      const slope = (normY * 0.7 - normX * 0.4) * 12;

      const elevation = Math.round((baseElevationM + ridge1 + ridge2 + knoll + slope) * 10) / 10;

      values[r][c] = elevation;

      if (elevation < minElevationM) minElevationM = elevation;
      if (elevation > maxElevationM) maxElevationM = elevation;
      sumElevationM += elevation;
    }
  }

  const meanElevationM = Math.round((sumElevationM / (cols * rows)) * 10) / 10;
  const reliefM = Math.round((maxElevationM - minElevationM) * 10) / 10;

  return {
    bounds,
    cols,
    rows,
    cellWidthDeg,
    cellHeightDeg,
    values,
    minElevationM,
    maxElevationM,
    meanElevationM,
    reliefM
  };
}

/**
 * Calculates a bounding box around a center coordinate or polygon with specified buffer in meters
 */
export function getBoundingBoxWithBuffer(
  center: [number, number],
  bufferMeters: number = 350
): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  const [lng, lat] = center;
  const earthRadius = 6378137.0;

  const latOffset = (bufferMeters / earthRadius) * (180 / Math.PI);
  const lngOffset = (bufferMeters / (earthRadius * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);

  return {
    minLng: lng - lngOffset,
    maxLng: lng + lngOffset,
    minLat: lat - latOffset,
    maxLat: lat + latOffset
  };
}
