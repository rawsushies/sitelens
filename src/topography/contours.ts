/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Topographic Contour & Hypsometry Engine
 *
 * Implements Marching Squares contour isoline generation and Kepler.gl-inspired
 * hypsometric elevation tinting for architectural site intelligence.
 */

import { ElevationGrid } from './elevation-grid';
import { calculateGeodesicDistance } from '../geometry';

export interface TopographicContourLine {
  id: string;
  elevationM: number;
  isIndexContour: boolean;
  coordinates: [number, number][]; // Array of [lng, lat]
  color: string;
  strokeWidth: number;
  lengthM: number;
}

export interface HypsometricLegendBin {
  elevationM: number;
  color: string;
  label: string;
}

export interface TopographicDataset {
  contours: TopographicContourLine[];
  minElevationM: number;
  maxElevationM: number;
  intervalM: number;
  indexIntervalM: number;
  totalLengthKm: number;
  legend: HypsometricLegendBin[];
}

export type HypsometricRampName = 'kepler' | 'terrain' | 'spectral' | 'minimal';

export const HYPSOMETRIC_RAMPS: Record<HypsometricRampName, { name: string; colors: string[] }> = {
  kepler: {
    name: 'Kepler Emerald-to-Purple',
    // Reference Image 2 style: Emerald -> Cyan -> Blue -> Geo Purple -> Pink -> Amber
    colors: ['#10B981', '#06B6D4', '#3B82F6', '#7C5CFF', '#D946EF', '#F59E0B']
  },
  terrain: {
    name: 'Architectural Topo',
    colors: ['#047857', '#65A30D', '#CA8A04', '#D97706', '#7C5CFF', '#E2E8F0']
  },
  spectral: {
    name: 'Spectral Elevation',
    colors: ['#2563EB', '#06B6D4', '#10B981', '#EAB308', '#EA580C', '#DC2626']
  },
  minimal: {
    name: 'Architectural Charcoal & Silver',
    colors: ['#64748B', '#94A3B8', '#CBD5E1', '#E2E8F0', '#F8FAFC', '#7C5CFF']
  }
};

/**
 * Returns a hex color for an elevation value given the min/max range and color ramp
 */
export function getHypsometricColor(
  elevation: number,
  minElev: number,
  maxElev: number,
  rampName: HypsometricRampName = 'kepler'
): string {
  const ramp = HYPSOMETRIC_RAMPS[rampName] || HYPSOMETRIC_RAMPS.kepler;
  const colors = ramp.colors;
  const range = maxElev - minElev || 1;
  const t = Math.max(0, Math.min(1, (elevation - minElev) / range));

  const idx = t * (colors.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return colors[lower];

  const frac = idx - lower;
  return interpolateColor(colors[lower], colors[upper], frac);
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16),
    parseInt(c.substring(2, 4), 16),
    parseInt(c.substring(4, 6), 16)
  ];
}

function interpolateColor(c1: string, c2: string, factor: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Marching Squares isocontour line segment generator
 */
export function generateContours(
  grid: ElevationGrid,
  intervalM: number = 5,
  rampName: HypsometricRampName = 'kepler'
): TopographicDataset {
  const { bounds, cols, rows, cellWidthDeg, cellHeightDeg, values, minElevationM, maxElevationM } = grid;

  // Calculate clean contour levels
  const startLevel = Math.ceil(minElevationM / intervalM) * intervalM;
  const endLevel = Math.floor(maxElevationM / intervalM) * intervalM;

  const levels: number[] = [];
  for (let lvl = startLevel; lvl <= endLevel; lvl += intervalM) {
    levels.push(Math.round(lvl * 10) / 10);
  }

  // Index contour interval is typically 5x standard interval
  const indexIntervalM = intervalM * 5;

  const contours: TopographicContourLine[] = [];
  let totalLengthM = 0;

  for (const level of levels) {
    const isIndex = Math.abs(level % indexIntervalM) < 0.001 || level === startLevel || level === endLevel;
    const rawSegments: [[number, number], [number, number]][] = [];

    // Traverse cells
    for (let r = 0; r < rows - 1; r++) {
      const lat0 = bounds.minLat + r * cellHeightDeg;
      const lat1 = bounds.minLat + (r + 1) * cellHeightDeg;

      for (let c = 0; c < cols - 1; c++) {
        const lng0 = bounds.minLng + c * cellWidthDeg;
        const lng1 = bounds.minLng + (c + 1) * cellWidthDeg;

        const v00 = values[r][c];
        const v10 = values[r][c + 1];
        const v11 = values[r + 1][c + 1];
        const v01 = values[r + 1][c];

        let cellCode = 0;
        if (v00 >= level) cellCode |= 1;
        if (v10 >= level) cellCode |= 2;
        if (v11 >= level) cellCode |= 4;
        if (v01 >= level) cellCode |= 8;

        if (cellCode === 0 || cellCode === 15) continue;

        // Edge intersection points
        const bottom: [number, number] = [
          lng0 + cellWidthDeg * ((level - v00) / (v10 - v00 || 1e-9)),
          lat0
        ];
        const right: [number, number] = [
          lng1,
          lat0 + cellHeightDeg * ((level - v10) / (v11 - v10 || 1e-9))
        ];
        const top: [number, number] = [
          lng0 + cellWidthDeg * ((level - v01) / (v11 - v01 || 1e-9)),
          lat1
        ];
        const left: [number, number] = [
          lng0,
          lat0 + cellHeightDeg * ((level - v00) / (v01 - v00 || 1e-9))
        ];

        switch (cellCode) {
          case 1:
          case 14:
            rawSegments.push([left, bottom]);
            break;
          case 2:
          case 13:
            rawSegments.push([bottom, right]);
            break;
          case 3:
          case 12:
            rawSegments.push([left, right]);
            break;
          case 4:
          case 11:
            rawSegments.push([right, top]);
            break;
          case 5:
            rawSegments.push([left, top]);
            rawSegments.push([bottom, right]);
            break;
          case 6:
          case 9:
            rawSegments.push([bottom, top]);
            break;
          case 7:
          case 8:
            rawSegments.push([left, top]);
            break;
          case 10:
            rawSegments.push([left, bottom]);
            rawSegments.push([right, top]);
            break;
        }
      }
    }

    if (rawSegments.length === 0) continue;

    // Chain segments into connected polylines
    const chains = chainSegments(rawSegments);

    const color = getHypsometricColor(level, minElevationM, maxElevationM, rampName);
    const strokeWidth = isIndex ? 1.75 : 0.85;

    for (let i = 0; i < chains.length; i++) {
      const coords = chains[i];
      if (coords.length < 2) continue;

      let lineLen = 0;
      for (let j = 0; j < coords.length - 1; j++) {
        lineLen += calculateGeodesicDistance(coords[j], coords[j + 1]).distanceM;
      }
      totalLengthM += lineLen;

      contours.push({
        id: `contour-${level}-${i}`,
        elevationM: level,
        isIndexContour: isIndex,
        coordinates: coords,
        color,
        strokeWidth,
        lengthM: Math.round(lineLen * 10) / 10
      });
    }
  }

  // Generate legend swatches
  const legendStepCount = Math.min(6, Math.max(3, levels.length));
  const legend: HypsometricLegendBin[] = [];
  for (let s = 0; s < legendStepCount; s++) {
    const fraction = s / (legendStepCount - 1 || 1);
    const elev = Math.round((minElevationM + fraction * (maxElevationM - minElevationM)) * 10) / 10;
    const color = getHypsometricColor(elev, minElevationM, maxElevationM, rampName);
    legend.push({
      elevationM: elev,
      color,
      label: `${elev.toFixed(1)} m`
    });
  }

  return {
    contours,
    minElevationM,
    maxElevationM,
    intervalM,
    indexIntervalM,
    totalLengthKm: Math.round((totalLengthM / 1000) * 100) / 100,
    legend
  };
}

/**
 * Greedily chains raw 2-point segments into continuous polylines
 */
function chainSegments(
  segments: [[number, number], [number, number]][],
  tolerance: number = 0.00005
): [number, number][][] {
  const result: [number, number][][] = [];
  const remaining = [...segments];

  while (remaining.length > 0) {
    const current = remaining.pop()!;
    const chain: [number, number][] = [current[0], current[1]];

    let extended = true;
    while (extended) {
      extended = false;
      const head = chain[0];
      const tail = chain[chain.length - 1];

      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const [p1, p2] = seg;

        // Matches tail
        if (distanceSq(tail, p1) < tolerance * tolerance) {
          chain.push(p2);
          remaining.splice(i, 1);
          extended = true;
          break;
        } else if (distanceSq(tail, p2) < tolerance * tolerance) {
          chain.push(p1);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        // Matches head
        else if (distanceSq(head, p2) < tolerance * tolerance) {
          chain.unshift(p1);
          remaining.splice(i, 1);
          extended = true;
          break;
        } else if (distanceSq(head, p1) < tolerance * tolerance) {
          chain.unshift(p2);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }

    if (chain.length >= 2) {
      result.push(chain);
    }
  }

  return result;
}

function distanceSq(p1: [number, number], p2: [number, number]): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return dx * dx + dy * dy;
}
