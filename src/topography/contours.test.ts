/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Unit Tests - Topographic Contours & Hypsometric Elevation Engine
 */

import { describe, it, expect } from 'vitest';
import { generateElevationGrid, getBoundingBoxWithBuffer } from './elevation-grid';
import { generateContours, getHypsometricColor, HYPSOMETRIC_RAMPS } from './contours';

describe('Topographic Elevation Grid Generation', () => {
  it('generates consistent georeferenced DEM bounds and values', () => {
    const center: [number, number] = [-0.0015, 51.4769];
    const bounds = getBoundingBoxWithBuffer(center, 250);

    const grid = generateElevationGrid(bounds, 45, 16, 16);

    expect(grid.cols).toBe(16);
    expect(grid.rows).toBe(16);
    expect(grid.values.length).toBe(16);
    expect(grid.values[0].length).toBe(16);
    expect(grid.minElevationM).toBeLessThanOrEqual(grid.maxElevationM);
    expect(grid.reliefM).toBe(Math.round((grid.maxElevationM - grid.minElevationM) * 10) / 10);
    expect(grid.meanElevationM).toBeGreaterThan(0);
  });
});

describe('Marching Squares Contour Extraction', () => {
  it('extracts closed and continuous contour polylines at specified intervals', () => {
    const center: [number, number] = [-0.0015, 51.4769];
    const bounds = getBoundingBoxWithBuffer(center, 300);
    const grid = generateElevationGrid(bounds, 50, 24, 24);

    const topo = generateContours(grid, 5, 'kepler');

    expect(topo.contours.length).toBeGreaterThan(0);
    expect(topo.intervalM).toBe(5);
    expect(topo.totalLengthKm).toBeGreaterThan(0);
    expect(topo.legend.length).toBeGreaterThan(2);

    // Verify each contour has valid coordinates and elevation
    for (const c of topo.contours) {
      expect(c.elevationM).toBeGreaterThanOrEqual(topo.minElevationM);
      expect(c.elevationM).toBeLessThanOrEqual(topo.maxElevationM);
      expect(c.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('marks index contours with increased stroke width at 5x interval', () => {
    const center: [number, number] = [0, 0];
    const bounds = getBoundingBoxWithBuffer(center, 200);
    const grid = generateElevationGrid(bounds, 100, 20, 20);

    const topo = generateContours(grid, 2, 'terrain');

    const indexContours = topo.contours.filter(c => c.isIndexContour);
    const normalContours = topo.contours.filter(c => !c.isIndexContour);

    expect(indexContours.length).toBeGreaterThan(0);
    if (normalContours.length > 0) {
      expect(indexContours[0].strokeWidth).toBeGreaterThan(normalContours[0].strokeWidth);
    }
  });

  it('interpolates hypsometric colors smoothly across the elevation range', () => {
    const min = 10;
    const max = 100;

    const lowColor = getHypsometricColor(10, min, max, 'kepler');
    const midColor = getHypsometricColor(55, min, max, 'kepler');
    const highColor = getHypsometricColor(100, min, max, 'kepler');

    expect(lowColor).toBe(HYPSOMETRIC_RAMPS.kepler.colors[0]); // Lowest is emerald
    expect(highColor).toBe(HYPSOMETRIC_RAMPS.kepler.colors[HYPSOMETRIC_RAMPS.kepler.colors.length - 1]); // Highest is amber
    expect(midColor).not.toBe(lowColor);
    expect(midColor).not.toBe(highColor);
  });
});
