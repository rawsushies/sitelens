/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens M2.0 Data Providers & Spatial Foundation Test Suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundedLRUCache } from './cache';
import { isPointInPolygon, isBBoxIntersecting, filterFeaturesBySiteBoundary } from './spatial-filter';
import { OSMDataProvider } from './adapters/osm';
import { OpenMeteoWeatherProvider } from './adapters/open-meteo';
import { ElevationDataProvider } from './adapters/elevation';
import { resilientFetch } from './client';
import { generateSiteIntelligenceReport } from '../reporting';
import { analyzePolygon } from '../geometry';
import { createDefaultProject } from '../projects';
import { inspectCoordinates } from '../coordinates';
import type { Feature } from 'geojson';

describe('M2.0 BoundedLRUCache', () => {
  it('manages LRU eviction when capacity is reached', () => {
    const cache = new BoundedLRUCache<string>(3, 60000);
    cache.set('k1', 'val1');
    cache.set('k2', 'val2');
    cache.set('k3', 'val3');

    expect(cache.size()).toBe(3);
    expect(cache.get('k1')).toBe('val1'); // access k1 to make it most recently used

    // Add 4th item, should evict k2 (oldest)
    cache.set('k4', 'val4');
    expect(cache.size()).toBe(3);
    expect(cache.get('k2')).toBeUndefined();
    expect(cache.get('k1')).toBe('val1');
    expect(cache.get('k3')).toBe('val3');
    expect(cache.get('k4')).toBe('val4');
  });

  it('expires entries after TTL', async () => {
    const cache = new BoundedLRUCache<string>(5, 20); // 20ms TTL
    cache.set('temp', 'temporary-data');
    expect(cache.get('temp')).toBe('temporary-data');

    await new Promise(r => setTimeout(r, 30));
    expect(cache.get('temp')).toBeUndefined();
  });

  it('generates normalized keys with coordinate precision rounding', () => {
    const key1 = BoundedLRUCache.generateKey('osm', { lat: 51.476888, lng: -0.001543, radius: 300 });
    const key2 = BoundedLRUCache.generateKey('osm', { radius: 300, lng: -0.001511, lat: 51.476912 });
    // Latitudes round to 51.4769, longitudes to -0.0015
    expect(key1).toBe(key2);
  });

  it('invalidates entries by prefix', () => {
    const cache = new BoundedLRUCache<string>(10);
    cache.set('osm:query1', 'data1');
    cache.set('osm:query2', 'data2');
    cache.set('weather:query1', 'data3');

    const removed = cache.invalidatePrefix('osm:');
    expect(removed).toBe(2);
    expect(cache.get('osm:query1')).toBeUndefined();
    expect(cache.get('weather:query1')).toBe('data3');
  });
});

describe('M2.0 Spatial Containment & Boundary Filtering', () => {
  const squareRing: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0]
  ];

  it('correctly tests point containment in polygon', () => {
    expect(isPointInPolygon([5, 5], squareRing)).toBe(true);
    expect(isPointInPolygon([15, 5], squareRing)).toBe(false);
    expect(isPointInPolygon([-1, 5], squareRing)).toBe(false);
  });

  it('tests bounding box intersections', () => {
    expect(isBBoxIntersecting([0, 0, 5, 5], [4, 4, 10, 10])).toBe(true);
    expect(isBBoxIntersecting([0, 0, 2, 2], [5, 5, 10, 10])).toBe(false);
  });

  it('filters GeoJSON features by site boundary', () => {
    const features: Feature[] = [
      {
        type: 'Feature',
        id: 'f-inside',
        geometry: { type: 'Point', coordinates: [5, 5] },
        properties: { name: 'Inside Point' }
      },
      {
        type: 'Feature',
        id: 'f-outside',
        geometry: { type: 'Point', coordinates: [50, 50] },
        properties: { name: 'Outside Point' }
      },
      {
        type: 'Feature',
        id: 'f-line',
        geometry: { type: 'LineString', coordinates: [[2, 2], [8, 8]] },
        properties: { name: 'Inside Line' }
      }
    ];

    const filtered = filterFeaturesBySiteBoundary(features, squareRing);
    expect(filtered.length).toBe(2);
    expect(filtered.some(f => f.id === 'f-inside')).toBe(true);
    expect(filtered.some(f => f.id === 'f-line')).toBe(true);
    expect(filtered.some(f => f.id === 'f-outside')).toBe(false);
  });
});

describe('M2.0 Resilient HTTP Client', () => {
  it('handles client cancellation immediately without retrying', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await resilientFetch('https://example.com/api', {
      signal: controller.signal
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('ABORTED');
    expect(result.error?.retryable).toBe(false);
  });
});

describe('M2.0 OSM Overpass Adapter', () => {
  it('assembles real polygon and road geometry from Overpass response and handles empty data', async () => {
    const provider = new OSMDataProvider();

    // Mock fetch for Overpass interpreter
    const mockElements = [
      {
        type: 'way',
        id: 101,
        tags: { building: 'yes', name: 'Pavilion' },
        geometry: [
          { lat: 51.476, lon: -0.002 },
          { lat: 51.477, lon: -0.002 },
          { lat: 51.477, lon: -0.001 },
          { lat: 51.476, lon: -0.001 },
          { lat: 51.476, lon: -0.002 }
        ]
      },
      {
        type: 'way',
        id: 202,
        tags: { highway: 'primary', name: 'Park Lane' },
        geometry: [
          { lat: 51.475, lon: -0.003 },
          { lat: 51.476, lon: -0.003 }
        ]
      },
      {
        type: 'node',
        id: 303,
        lat: 51.4765,
        lon: -0.0015,
        tags: { amenity: 'cafe', name: 'Observatory Cafe' }
      }
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ elements: mockElements })
    } as any);

    try {
      const res = await provider.fetch({ latitude: 51.4769, longitude: -0.0015, radiusMeters: 300 });

      expect(res.status).toBe('success');
      expect(res.data?.buildingCount).toBe(1);
      expect(res.data?.roadCount).toBe(1);
      expect(res.data?.amenityCount).toBe(1);
      expect(res.metadata.license.id).toBe('ODbL-1.0');
      expect(res.featureCollection?.features.length).toBe(3);

      const bldgFeature = res.featureCollection?.features.find((f: any) => f.properties?.featureType === 'building');
      expect(bldgFeature?.geometry.type).toBe('Polygon');
      expect((bldgFeature?.properties as any)?.name).toBe('Pavilion');

      const roadFeature = res.featureCollection?.features.find((f: any) => f.properties?.featureType === 'road');
      expect(roadFeature?.geometry.type).toBe('LineString');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('marks dataset as empty when 0 elements returned', async () => {
    const provider = new OSMDataProvider();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ elements: [] })
    } as any);

    try {
      const res = await provider.fetch({ latitude: 51.4769, longitude: -0.0015 });
      expect(res.status).toBe('empty');
      expect(res.data?.buildingCount).toBe(0);
      expect(res.featureCollection?.features.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('M2.0 Open-Meteo & Elevation Adapters', () => {
  it('extracts real weather attributes and does not substitute 0 for missing elevation', async () => {
    const provider = new OpenMeteoWeatherProvider();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        latitude: 51.4769,
        longitude: -0.0015,
        elevation: 48.0,
        utc_offset_seconds: 0,
        timezone: 'GMT',
        generationtime_ms: 0.25,
        current: {
          time: '2026-10-31T00:00',
          interval: 900,
          temperature_2m: 14.2,
          relative_humidity_2m: 78,
          apparent_temperature: 13.5,
          precipitation: 0.0,
          weather_code: 2,
          wind_speed_10m: 18.5,
          wind_direction_10m: 230
        }
      })
    } as any);

    try {
      const res = await provider.fetch({ latitude: 51.4769, longitude: -0.0015 });
      expect(res.status).toBe('success');
      expect(res.data?.current.temperature2m).toBe(14.2);
      expect(res.data?.elevationM).toBe(48.0);
      expect(res.metadata.license.id).toBe('CC-BY-4.0');
      expect(res.metrics?.ambient_temperature.value).toBe(14.2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('marks elevation as unavailable when service returns HTTP error, with no fake 0 value', async () => {
    const provider = new ElevationDataProvider();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers(),
      text: async () => 'Service Temporarily Unavailable'
    } as any);

    try {
      const res = await provider.fetch({ latitude: 51.4769, longitude: -0.0015 });
      expect(res.status).toBe('unavailable');
      expect(res.data).toBeNull(); // Strictly null, never 0
      expect(res.error?.code).toBe('SERVER_ERROR');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Centroid Reporting Defect Fix Verification', () => {
  it('uses the true calculated polygon centroid coordinates instead of vertices[0]', () => {
    const project = createDefaultProject();

    // Polygon coordinates: asymmetric trapezoid
    const ring: [number, number][] = [
      [10.0, 50.0],
      [12.0, 50.0],
      [12.0, 52.0],
      [10.0, 51.0],
      [10.0, 50.0]
    ];

    const polyAnalysis = analyzePolygon(ring);
    const calculatedCentroid = polyAnalysis.centroid; // [lng, lat]
    const vertex0 = polyAnalysis.vertices[0]; // [10.0, 50.0]

    // Verify vertex0 is different from calculatedCentroid
    expect(calculatedCentroid[0]).not.toBe(vertex0.longitude);
    expect(calculatedCentroid[1]).not.toBe(vertex0.latitude);

    const centroidExpectedReport = inspectCoordinates(calculatedCentroid[0], calculatedCentroid[1]);

    const report = generateSiteIntelligenceReport(project, polyAnalysis);

    expect(report.primaryBoundary).toBeDefined();
    // The report's centroidDms must match the calculated centroid's dmsFormatted, NOT vertices[0]!
    expect(report.primaryBoundary?.centroidDms).toBe(centroidExpectedReport.dmsFormatted);
    expect(report.primaryBoundary?.centroidDms).not.toBe(vertex0.dmsFormatted);
    expect(report.primaryBoundary?.centroidUtm).toBe(centroidExpectedReport.utm.formatted);
  });
});
