/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Topographic Elevation Grid Engine
 *
 * Samples genuine Digital Elevation Model (DEM) ground surface measurements via Open-Meteo Elevation API
 * across a georeferenced grid covering the active site boundary and buffer.
 * Strictly distinguishes measured DEM samples from unavailable values and never substitutes synthetic terrain.
 */

import { resilientFetch } from '../data-providers/client';
import { BoundedLRUCache } from '../data-providers/cache';
import { DatasetMetadata, DatasetError } from '../data-providers/types';

export type ElevationSampleStatus = 'measured' | 'interpolated' | 'unavailable';

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
  values: (number | null)[][]; // [row][col] elevation in meters ASL (null when unavailable)
  sampleStatus: ElevationSampleStatus[][]; // [row][col] status of each sample point
  validSampleCount: number;
  totalSampleCount: number;
  minElevationM: number;
  maxElevationM: number;
  meanElevationM: number;
  reliefM: number;
  metadata: DatasetMetadata;
}

export interface FetchElevationGridResult {
  status: 'success' | 'partial' | 'empty' | 'unavailable' | 'error';
  grid: ElevationGrid | null;
  error?: DatasetError;
  metadata: DatasetMetadata;
}

export interface FetchElevationGridOptions {
  cols?: number;
  rows?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  bypassCache?: boolean;
}

const ELEVATION_GRID_METADATA: DatasetMetadata = {
  id: 'open-meteo-elevation-grid',
  title: 'Multi-Point Digital Elevation Model (DEM) Surface Grid',
  description: 'Georeferenced raster grid of ground surface elevations referenced to Mean Sea Level (EGM96 geoid vertical datum).',
  source: 'Open-Meteo Elevation API (Multi-Source Global DEM Compilation)',
  sourceUrl: 'https://open-meteo.com/en/docs/elevation-api',
  license: {
    id: 'Open-Meteo-Elevation',
    name: 'Open Data Commons / Public Domain Composite',
    url: 'https://open-meteo.com',
    attributionStatement: 'Elevation data by Open-Meteo.com',
    requiresAttribution: true,
    commercialUseAllowed: true,
  },
  attribution: 'Elevation data by Open-Meteo.com',
  timestampOrReferencePeriod: 'Multi-Mission Global DEM Baseline',
  spatialResolution: 'Variable DEM grid resolution (~30m–90m native raster; Open-Meteo API does not expose sub-model or cell size)',
  method: 'Direct multi-coordinate batch sampling from composite global DEM raster grid',
  crs: 'EPSG:4326 horizontal, EGM96 geoid vertical',
  units: {
    elevation: 'metres above sea level (m ASL)'
  },
  limitations: 'Sampled on a discrete georeferenced grid over the site bounding box. Open-Meteo does not return individual DEM sub-model identifiers. Contour isolines are interpolated between discrete grid nodes using Marching Squares; not a substitute for an instrumental topographic land survey.',
  retrievedAt: new Date().toISOString()
};

// Dedicated LRU cache for elevation grids (40 entries, 20 minute TTL)
const elevationGridCache = new BoundedLRUCache<FetchElevationGridResult>(40, 20 * 60 * 1000);

/**
 * Fetches a genuine georeferenced elevation grid from Open-Meteo Elevation API.
 * Never fabricates or substitutes synthetic terrain when real DEM data is unavailable.
 */
export async function fetchRealElevationGrid(
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  options: FetchElevationGridOptions = {}
): Promise<FetchElevationGridResult> {
  // Default 9x9 grid = 81 coordinate samples (fits cleanly within a single 100-coordinate Open-Meteo batch request)
  const cols = Math.min(Math.max(options.cols ?? 9, 2), 20);
  const rows = Math.min(Math.max(options.rows ?? 9, 2), 20);

  const cacheKey = BoundedLRUCache.generateKey('elevation-grid', {
    minLng: Number(bounds.minLng.toFixed(6)),
    maxLng: Number(bounds.maxLng.toFixed(6)),
    minLat: Number(bounds.minLat.toFixed(6)),
    maxLat: Number(bounds.maxLat.toFixed(6)),
    cols,
    rows
  });

  if (!options.bypassCache) {
    const cached = elevationGridCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const metadata: DatasetMetadata = {
    ...ELEVATION_GRID_METADATA,
    retrievedAt: new Date().toISOString()
  };

  const minLng = bounds.minLng;
  const maxLng = bounds.maxLng;
  const minLat = bounds.minLat;
  const maxLat = bounds.maxLat;

  const cellWidthDeg = (maxLng - minLng) / (cols - 1);
  const cellHeightDeg = (maxLat - minLat) / (rows - 1);

  // Build ordered coordinate list row-by-row (latitude = Y, longitude = X)
  const sampleCoords: { r: number; c: number; lat: number; lng: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const lat = minLat + r * cellHeightDeg;
    for (let c = 0; c < cols; c++) {
      const lng = minLng + c * cellWidthDeg;
      sampleCoords.push({ r, c, lat, lng });
    }
  }

  // Open-Meteo Elevation API supports up to 100 coordinates per request
  const BATCH_SIZE = 100;
  const rawElevations: (number | null)[] = new Array(sampleCoords.length).fill(null);

  for (let i = 0; i < sampleCoords.length; i += BATCH_SIZE) {
    const batch = sampleCoords.slice(i, i + BATCH_SIZE);
    const latsStr = batch.map(pt => pt.lat.toFixed(5)).join(',');
    const lngsStr = batch.map(pt => pt.lng.toFixed(5)).join(',');

    const url = `https://api.open-meteo.com/v1/elevation?latitude=${latsStr}&longitude=${lngsStr}`;

    const res = await resilientFetch(url, {
      method: 'GET',
      timeoutMs: options.timeoutMs || 10000,
      retries: 2,
      signal: options.signal
    });

    if (!res.ok || !res.data) {
      return {
        status: res.error?.code === 'ABORTED' ? 'unavailable' : 'unavailable',
        grid: null,
        metadata,
        error: res.error || {
          code: 'UNAVAILABLE',
          message: 'Open-Meteo DEM elevation service unavailable.',
          retryable: true,
          timestamp: new Date().toISOString()
        }
      };
    }

    const payload = res.data;
    if (!Array.isArray(payload.elevation)) {
      return {
        status: 'error',
        grid: null,
        metadata,
        error: {
          code: 'PARSE_ERROR',
          message: 'Elevation API payload did not contain an elevation array.',
          retryable: false,
          timestamp: new Date().toISOString()
        }
      };
    }

    for (let j = 0; j < batch.length; j++) {
      const val = payload.elevation[j];
      if (typeof val === 'number' && Number.isFinite(val)) {
        rawElevations[i + j] = Math.round(val * 10) / 10;
      } else {
        rawElevations[i + j] = null;
      }
    }
  }

  const values: (number | null)[][] = [];
  const sampleStatus: ElevationSampleStatus[][] = [];

  for (let r = 0; r < rows; r++) {
    values[r] = [];
    sampleStatus[r] = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const val = rawElevations[idx];
      values[r][c] = val;
      sampleStatus[r][c] = val !== null ? 'measured' : 'unavailable';
    }
  }

  const grid = buildElevationGridFromSamples(bounds, values, sampleStatus, metadata);
  if (!grid || grid.validSampleCount === 0) {
    return {
      status: 'empty',
      grid: null,
      metadata,
      error: {
        code: 'UNAVAILABLE',
        message: 'No valid elevation measurements returned for the sampled site coordinates.',
        retryable: false,
        timestamp: new Date().toISOString()
      }
    };
  }

  const status = grid.validSampleCount < grid.totalSampleCount ? 'partial' : 'success';
  const result: FetchElevationGridResult = {
    status,
    grid,
    metadata
  };

  elevationGridCache.set(cacheKey, result);
  return result;
}

/**
 * Constructs an ElevationGrid from a 2D array of measured or test elevation samples.
 * Preserves null for unavailable samples without substituting fake 0m values.
 */
export function buildElevationGridFromSamples(
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  values: (number | null)[][],
  sampleStatus?: ElevationSampleStatus[][],
  customMetadata?: DatasetMetadata
): ElevationGrid | null {
  const rows = values.length;
  if (rows < 2) return null;
  const cols = values[0]?.length || 0;
  if (cols < 2) return null;

  const cellWidthDeg = (bounds.maxLng - bounds.minLng) / (cols - 1);
  const cellHeightDeg = (bounds.maxLat - bounds.minLat) / (rows - 1);

  let minElevationM = Infinity;
  let maxElevationM = -Infinity;
  let sumElevationM = 0;
  let validSampleCount = 0;
  const totalSampleCount = rows * cols;

  const resolvedStatus: ElevationSampleStatus[][] = [];

  for (let r = 0; r < rows; r++) {
    resolvedStatus[r] = [];
    for (let c = 0; c < cols; c++) {
      const v = values[r]?.[c] ?? null;
      const st = sampleStatus?.[r]?.[c] ?? (v !== null && Number.isFinite(v) ? 'measured' : 'unavailable');
      resolvedStatus[r][c] = st;

      if (v !== null && Number.isFinite(v)) {
        if (v < minElevationM) minElevationM = v;
        if (v > maxElevationM) maxElevationM = v;
        sumElevationM += v;
        validSampleCount++;
      }
    }
  }

  if (validSampleCount === 0) {
    return null;
  }

  const meanElevationM = Math.round((sumElevationM / validSampleCount) * 10) / 10;
  const reliefM = Math.round((maxElevationM - minElevationM) * 10) / 10;

  return {
    bounds,
    cols,
    rows,
    cellWidthDeg,
    cellHeightDeg,
    values,
    sampleStatus: resolvedStatus,
    validSampleCount,
    totalSampleCount,
    minElevationM,
    maxElevationM,
    meanElevationM,
    reliefM,
    metadata: customMetadata || {
      ...ELEVATION_GRID_METADATA,
      retrievedAt: new Date().toISOString()
    }
  };
}

/**
 * Calculates a bounding box around a polygon ring or center coordinate with specified buffer in meters
 */
export function getBoundingBoxWithBuffer(
  centerOrRing: [number, number] | [number, number][],
  bufferMeters: number = 150
): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  const earthRadius = 6378137.0;

  // Check if input is a single [lng, lat] coordinate pair or a polygon ring [[lng, lat], ...]
  if (
    Array.isArray(centerOrRing) &&
    centerOrRing.length === 2 &&
    typeof centerOrRing[0] === 'number' &&
    typeof centerOrRing[1] === 'number'
  ) {
    const [lng, lat] = centerOrRing as [number, number];
    const latOffset = (bufferMeters / earthRadius) * (180 / Math.PI);
    const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
    const lngOffset = (bufferMeters / (earthRadius * cosLat)) * (180 / Math.PI);

    return {
      minLng: lng - lngOffset,
      maxLng: lng + lngOffset,
      minLat: lat - latOffset,
      maxLat: lat + latOffset
    };
  }

  const ring = centerOrRing as [number, number][];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const pt of ring) {
    if (pt[0] < minLng) minLng = pt[0];
    if (pt[0] > maxLng) maxLng = pt[0];
    if (pt[1] < minLat) minLat = pt[1];
    if (pt[1] > maxLat) maxLat = pt[1];
  }

  const centerLat = (minLat + maxLat) / 2;
  const latOffset = (bufferMeters / earthRadius) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01);
  const lngOffset = (bufferMeters / (earthRadius * cosLat)) * (180 / Math.PI);

  return {
    minLng: minLng - lngOffset,
    maxLng: maxLng + lngOffset,
    minLat: minLat - latOffset,
    maxLat: maxLat + latOffset
  };
}

export function clearElevationGridCache(): void {
  elevationGridCache.clear();
}
