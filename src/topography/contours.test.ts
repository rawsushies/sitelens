/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Unit Tests - Topographic Contours, Real DEM Grid Sampling & Hypsometric Engine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchRealElevationGrid,
  buildElevationGridFromSamples,
  getBoundingBoxWithBuffer,
  clearElevationGridCache
} from './elevation-grid';
import { generateContours, getHypsometricColor, HYPSOMETRIC_RAMPS } from './contours';

describe('Real DEM Elevation Grid Sampling & Provenance', () => {
  beforeEach(() => {
    clearElevationGridCache();
  });

  it('samples genuine DEM elevations via Open-Meteo Elevation API and preserves coordinate ordering', async () => {
    const originalFetch = globalThis.fetch;
    const center: [number, number] = [-0.0015, 51.4769];
    const bounds = getBoundingBoxWithBuffer(center, 150);

    // Mock 4x4 grid = 16 samples with realistic sloping terrain (30m to 60m)
    const mockElevations = [
      30.2, 32.5, 35.0, 38.1,
      34.0, 37.2, 41.5, 44.8,
      39.5, 43.1, 48.0, 52.4,
      45.0, 50.2, 55.6, 60.8
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        elevation: mockElevations
      })
    } as any);

    try {
      const res = await fetchRealElevationGrid(bounds, { cols: 4, rows: 4 });
      expect(res.status).toBe('success');
      expect(res.grid).not.toBeNull();
      expect(res.grid?.cols).toBe(4);
      expect(res.grid?.rows).toBe(4);
      expect(res.grid?.validSampleCount).toBe(16);
      expect(res.grid?.totalSampleCount).toBe(16);
      expect(res.grid?.minElevationM).toBe(30.2);
      expect(res.grid?.maxElevationM).toBe(60.8);
      expect(res.grid?.reliefM).toBe(30.6);
      expect(res.grid?.sampleStatus[0][0]).toBe('measured');
      expect(res.metadata.source).toContain('Open-Meteo Elevation API');
      expect(res.metadata.crs).toBe('EPSG:4326 horizontal, EGM96 geoid vertical');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('never substitutes synthetic terrain when real DEM API fails', async () => {
    const originalFetch = globalThis.fetch;
    const bounds = getBoundingBoxWithBuffer([-0.0015, 51.4769], 150);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers(),
      text: async () => 'Upstream DEM timeout'
    } as any);

    try {
      const res = await fetchRealElevationGrid(bounds, { cols: 4, rows: 4, timeoutMs: 1000 });
      expect(res.status).toBe('unavailable');
      expect(res.grid).toBeNull();
      expect(res.error).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('distinguishes measured vs unavailable samples on partial API responses', async () => {
    const originalFetch = globalThis.fetch;
    const bounds = getBoundingBoxWithBuffer([-0.0015, 51.4769], 150);

    // 3x3 = 9 samples, with 2 null/NaN missing values
    const partialElevations = [
      12.0, 15.0, null,
      18.0, 22.0, 25.0,
      21.0, null, 30.0
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        elevation: partialElevations
      })
    } as any);

    try {
      const res = await fetchRealElevationGrid(bounds, { cols: 3, rows: 3 });
      expect(res.status).toBe('partial');
      expect(res.grid?.validSampleCount).toBe(7);
      expect(res.grid?.totalSampleCount).toBe(9);
      expect(res.grid?.sampleStatus[0][0]).toBe('measured');
      expect(res.grid?.sampleStatus[0][2]).toBe('unavailable');
      expect(res.grid?.values[0][2]).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Marching Squares Contour Extraction & GIS Edge Cases', () => {
  it('extracts continuous contour polylines from measured elevation grid', () => {
    const bounds = getBoundingBoxWithBuffer([-0.0015, 51.4769], 200);
    const values = [
      [20, 24, 28, 32, 36],
      [22, 27, 33, 38, 42],
      [25, 31, 40, 45, 49],
      [28, 35, 44, 51, 56],
      [30, 38, 47, 55, 62]
    ];
    const grid = buildElevationGridFromSamples(bounds, values)!;
    expect(grid).not.toBeNull();

    const topo = generateContours(grid, 5, 'kepler');

    expect(topo.contours.length).toBeGreaterThan(0);
    expect(topo.intervalM).toBe(5);
    expect(topo.totalLengthKm).toBeGreaterThan(0);
    expect(topo.legend.length).toBeGreaterThan(2);

    for (const c of topo.contours) {
      expect(c.elevationM).toBeGreaterThanOrEqual(topo.minElevationM);
      expect(c.elevationM).toBeLessThanOrEqual(topo.maxElevationM);
      expect(c.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('handles flat terrain and zero relief without division by zero or invalid contours', () => {
    const bounds = getBoundingBoxWithBuffer([-0.0015, 51.4769], 100);
    const flatValues = [
      [14.5, 14.5, 14.5],
      [14.5, 14.5, 14.5],
      [14.5, 14.5, 14.5]
    ];
    const grid = buildElevationGridFromSamples(bounds, flatValues)!;
    expect(grid.reliefM).toBe(0);

    const topo = generateContours(grid, 2, 'kepler');
    expect(topo.contours).toEqual([]);
    expect(topo.reliefM).toBe(0);
    expect(topo.legend.length).toBe(1);
    expect(topo.legend[0].elevationM).toBe(14.5);
  });

  it('handles negative elevations (below sea level basins / coastal bathymetry)', () => {
    const bounds = getBoundingBoxWithBuffer([35.5, 31.5], 200); // Dead Sea / depression example
    const negativeValues = [
      [-415, -410, -405, -400],
      [-412, -406, -398, -392],
      [-408, -400, -390, -382],
      [-402, -394, -384, -375]
    ];
    const grid = buildElevationGridFromSamples(bounds, negativeValues)!;
    expect(grid.minElevationM).toBe(-415);
    expect(grid.maxElevationM).toBe(-375);

    const topo = generateContours(grid, 10, 'kepler');
    expect(topo.contours.length).toBeGreaterThan(0);
    expect(topo.contours.every(c => c.elevationM < 0)).toBe(true);
  });

  it('skips cells with unavailable (null) DEM vertices instead of fabricating contour edges', () => {
    const bounds = getBoundingBoxWithBuffer([0, 0], 100);
    const valuesWithNulls: (number | null)[][] = [
      [10, 20, null],
      [15, 25, null],
      [null, null, null]
    ];
    const grid = buildElevationGridFromSamples(bounds, valuesWithNulls)!;
    expect(grid.validSampleCount).toBe(4);

    const topo = generateContours(grid, 5, 'terrain');
    // Only the top-left cell [10,20; 15,25] has all 4 valid corners
    expect(topo.contours.length).toBeGreaterThan(0);
    for (const c of topo.contours) {
      for (const pt of c.coordinates) {
        expect(Number.isFinite(pt[0])).toBe(true);
        expect(Number.isFinite(pt[1])).toBe(true);
      }
    }
  });

  it('interpolates hypsometric colors smoothly across the elevation range', () => {
    const min = 10;
    const max = 100;

    const lowColor = getHypsometricColor(10, min, max, 'kepler');
    const midColor = getHypsometricColor(55, min, max, 'kepler');
    const highColor = getHypsometricColor(100, min, max, 'kepler');

    expect(lowColor).toBe(HYPSOMETRIC_RAMPS.kepler.colors[0]);
    expect(highColor).toBe(HYPSOMETRIC_RAMPS.kepler.colors[HYPSOMETRIC_RAMPS.kepler.colors.length - 1]);
    expect(midColor).not.toBe(lowColor);
    expect(midColor).not.toBe(highColor);
  });
});
