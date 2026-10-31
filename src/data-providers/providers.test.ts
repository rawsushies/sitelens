/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens M2.0.1 Data Providers, Spatial Geometry & Provenance Test Suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundedLRUCache } from './cache';
import { 
  isPointInPolygon, 
  isBBoxIntersecting, 
  filterFeaturesBySiteBoundary,
  segmentsIntersect,
  isLineCrossingRing,
  polygonIntersectsBoundary,
  hasAntimeridianCrossing
} from './spatial-filter';
import { OSMDataProvider } from './adapters/osm';
import { OpenMeteoWeatherProvider } from './adapters/open-meteo';
import { ElevationDataProvider } from './adapters/elevation';
import { resilientFetch } from './client';
import { datasetRegistry } from './registry';
import { generateSiteIntelligenceReport } from '../reporting';
import { analyzePolygon } from '../geometry';
import { createDefaultProject } from '../projects';
import { inspectCoordinates } from '../coordinates';
import type { Feature } from 'geojson';

describe('M2.0.1 Cache Correctness & Key Isolation', () => {
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

  it('includes siteBoundary in cache identity to prevent cross-boundary cache collisions', () => {
    const query = { lat: 51.4769, lng: -0.0015, radius: 300 };
    const boundaryA: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    const boundaryB: [number, number][] = [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]];

    const keyA = BoundedLRUCache.generateKey('osm', query, { siteBoundary: boundaryA });
    const keyB = BoundedLRUCache.generateKey('osm', query, { siteBoundary: boundaryB });
    const keyNoBoundary = BoundedLRUCache.generateKey('osm', query);

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyNoBoundary);
    expect(keyB).not.toBe(keyNoBoundary);
  });

  it('generates normalized keys with stable coordinate precision rounding', () => {
    const key1 = BoundedLRUCache.generateKey('osm', { lat: 51.4768881, lng: -0.0015432, radius: 300 });
    const key2 = BoundedLRUCache.generateKey('osm', { radius: 300, lng: -0.0015431, lat: 51.4768882 });
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

describe('M2.0.1 In-Flight Request Deduplication & Independent Cancellation', () => {
  it('allows caller 1 to abort without aborting concurrent caller 2 on the same request', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;

    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      fetchCalls++;
      // Simulate network delay
      await new Promise(r => setTimeout(r, 60));
      if (init?.signal?.aborted) {
        throw new Error('Aborted');
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          latitude: 51.4769,
          longitude: -0.0015,
          current: { temperature_2m: 16.5, time: '2026-10-31T00:00' }
        })
      };
    });

    try {
      datasetRegistry.clearAllCache();
      const controller1 = new AbortController();

      // Launch request 1 with controller1
      const p1 = datasetRegistry.fetch('open-meteo-weather', { latitude: 51.4769, longitude: -0.0015 }, {
        signal: controller1.signal,
        bypassCache: true
      });

      // Concurrently launch request 2 without abort signal
      const p2 = datasetRegistry.fetch('open-meteo-weather', { latitude: 51.4769, longitude: -0.0015 }, {
        bypassCache: true
      });

      // Abort caller 1 after 15ms (underlying fetch is still running at 60ms)
      setTimeout(() => controller1.abort(), 15);

      const [res1, res2] = await Promise.all([p1, p2]);

      // Caller 1 is aborted
      expect(res1.status).toBe('unavailable');
      expect(res1.error?.code).toBe('ABORTED');

      // Caller 2 SUCCEEDS independently!
      expect(res2.status).toBe('success');
      expect(res2.data?.current?.temperature2m).toBe(16.5);

      // Verify only 1 network fetch was dispatched due to deduplication
      expect(fetchCalls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('M2.0.1 Robust Spatial Filtering & Geometry Intersection', () => {
  const siteSquare: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0]
  ];

  it('correctly tests segment-segment intersections', () => {
    expect(segmentsIntersect([0, 5], [10, 5], [5, 0], [5, 10])).toBe(true); // crossing
    expect(segmentsIntersect([0, 0], [2, 2], [3, 3], [5, 5])).toBe(false); // disjoint
  });

  it('retains crossing roads with 0 vertices inside the site boundary', () => {
    // Road passes straight through the square from south to north, with both endpoints outside!
    const crossingRoad: Feature = {
      type: 'Feature',
      id: 'road-crossing',
      geometry: {
        type: 'LineString',
        coordinates: [[5, -5], [5, 15]] // starts at y=-5, ends at y=15; crosses x in [0,10], y in [0,10]
      },
      properties: { name: 'Crossing Highway' }
    };

    const disjointRoad: Feature = {
      type: 'Feature',
      id: 'road-disjoint',
      geometry: {
        type: 'LineString',
        coordinates: [[20, 0], [20, 10]]
      },
      properties: { name: 'External Road' }
    };

    const filtered = filterFeaturesBySiteBoundary([crossingRoad, disjointRoad], siteSquare);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('road-crossing');
  });

  it('retains polygons that completely enclose the site boundary with 0 vertices inside', () => {
    // Large parcel/structure from [-5, -5] to [15, 15] enclosing siteSquare [0,0] to [10,10]
    const enclosingParcel: Feature = {
      type: 'Feature',
      id: 'parcel-enclosing',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-5, -5],
          [15, -5],
          [15, 15],
          [-5, 15],
          [-5, -5]
        ]]
      },
      properties: { name: 'Super Parcel' }
    };

    const disjointParcel: Feature = {
      type: 'Feature',
      id: 'parcel-disjoint',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [20, 20],
          [30, 20],
          [30, 30],
          [20, 30],
          [20, 20]
        ]]
      },
      properties: { name: 'Distant Parcel' }
    };

    const filtered = filterFeaturesBySiteBoundary([enclosingParcel, disjointParcel], siteSquare);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('parcel-enclosing');
  });

  it('handles polygon holes: excludes features where site boundary is entirely in an interior hole', () => {
    // Building with outer ring [-10, -10] to [20, 20] and inner hole [-2, -2] to [12, 12]
    // The site boundary [0,0] to [10,10] is completely inside the donut hole, so it touches no building mass
    const buildingWithCourtyardHole: Feature = {
      type: 'Feature',
      id: 'bldg-donut-hole',
      geometry: {
        type: 'Polygon',
        coordinates: [
          // Outer ring
          [[-10, -10], [20, -10], [20, 20], [-10, 20], [-10, -10]],
          // Inner ring (hole)
          [[-2, -2], [12, -2], [12, 12], [-2, 12], [-2, -2]]
        ]
      },
      properties: { name: 'Donut Building' }
    };

    const filtered = filterFeaturesBySiteBoundary([buildingWithCourtyardHole], siteSquare);
    expect(filtered.length).toBe(0);
  });

  it('detects antimeridian crossings', () => {
    // Normal coordinates within UK
    expect(hasAntimeridianCrossing([[-0.002, 51.476], [-0.001, 51.476]])).toBe(false);
    // Coordinates jumping from Fiji (+179) to Samoa (-179)
    expect(hasAntimeridianCrossing([[179.5, -16.0], [-179.5, -16.0]])).toBe(true);
  });
});

describe('M2.0.1 OSM Overpass Multipolygon Relations & Truncation', () => {
  it('correctly reconstructs multipolygon building relations with outer and inner rings, and deduplicates ways', async () => {
    const provider = new OSMDataProvider();

    // Mock Overpass response containing 1 multipolygon relation and its member ways
    const mockElements = [
      {
        type: 'relation',
        id: 9901,
        tags: {
          type: 'multipolygon',
          building: 'university',
          name: 'Academic Quadrangle'
        },
        members: [
          {
            type: 'way',
            ref: 501,
            role: 'outer',
            geometry: [
              { lat: 51.4760, lon: -0.0020 },
              { lat: 51.4780, lon: -0.0020 },
              { lat: 51.4780, lon: -0.0010 },
              { lat: 51.4760, lon: -0.0010 },
              { lat: 51.4760, lon: -0.0020 }
            ]
          },
          {
            type: 'way',
            ref: 502,
            role: 'inner',
            geometry: [
              { lat: 51.4765, lon: -0.0018 },
              { lat: 51.4775, lon: -0.0018 },
              { lat: 51.4775, lon: -0.0012 },
              { lat: 51.4765, lon: -0.0012 },
              { lat: 51.4765, lon: -0.0018 }
            ]
          }
        ]
      },
      // Way 501 also present in elements stream (standard Overpass output)
      {
        type: 'way',
        id: 501,
        tags: { building: 'yes' },
        geometry: [
          { lat: 51.4760, lon: -0.0020 },
          { lat: 51.4780, lon: -0.0020 },
          { lat: 51.4780, lon: -0.0010 },
          { lat: 51.4760, lon: -0.0010 },
          { lat: 51.4760, lon: -0.0020 }
        ]
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
      const res = await provider.fetch({ latitude: 51.4769, longitude: -0.0015 });

      expect(res.status).toBe('success');
      // Way 501 was deduplicated because it is a member of relation 9901!
      expect(res.data?.buildingCount).toBe(1);
      expect(res.data?.diagnostics.deduplicatedWaysCount).toBe(1);
      expect(res.data?.diagnostics.relationsProcessed).toBe(1);

      const relFeature = res.featureCollection?.features.find(f => f.id === 'osm-relation-9901');
      expect(relFeature).toBeDefined();
      expect(relFeature?.geometry.type).toBe('Polygon');
      // Polygon has 2 rings: 1 outer ring, 1 inner hole
      expect((relFeature?.geometry as any).coordinates.length).toBe(2);
      expect(relFeature?.properties?.name).toBe('Academic Quadrangle');
      expect(relFeature?.properties?.isMultipolygon).toBe(true);
      expect(relFeature?.properties?.holeCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('detects Overpass server truncation remark and marks dataset as partial', async () => {
    const provider = new OSMDataProvider();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        elements: [
          {
            type: 'way',
            id: 88,
            tags: { building: 'yes' },
            geometry: [{ lat: 51.476, lon: -0.002 }, { lat: 51.477, lon: -0.002 }, { lat: 51.476, lon: -0.002 }]
          }
        ],
        remark: 'runtime error: Query timed out after 18 seconds.'
      })
    } as any);

    try {
      const res = await provider.fetch({ latitude: 51.4769, longitude: -0.0015 });
      expect(res.status).toBe('partial');
      expect(res.stats?.isTruncated).toBe(true);
      expect(res.metadata.limitations).toContain('PARTIAL COVERAGE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('M2.0.1 Weather & Elevation Provenance Disclosures', () => {
  it('does not use geographic region inference and discloses variable model grid resolution', async () => {
    const provider = new OpenMeteoWeatherProvider();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        latitude: -33.8688, // Sydney, Australia
        longitude: 151.2093,
        elevation: 19.0,
        current: {
          time: '2026-10-31T00:00',
          temperature_2m: 21.4,
          wind_speed_10m: 14.0
        }
      })
    } as any);

    try {
      const res = await provider.fetch({ latitude: -33.8688, longitude: 151.2093 });
      expect(res.status).toBe('success');
      expect(res.metadata.source).toContain('Open-Meteo');
      expect(res.metrics?.ambient_temperature.source).toBe('Open-Meteo Best-Match Global NWP Ensemble');
      expect(res.metrics?.ambient_temperature.spatialResolution).toContain('Variable NWP grid resolution');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('documents multi-source DEM compilation and EGM96 geoid without falsely claiming 90m certified reading', async () => {
    const provider = new ElevationDataProvider();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        latitude: 51.4769,
        longitude: -0.0015,
        elevation: [48.5]
      })
    } as any);

    try {
      const res = await provider.fetch({ latitude: 51.4769, longitude: -0.0015 });
      expect(res.status).toBe('success');
      expect(res.data?.elevationM).toBe(48.5);
      expect(res.metadata.crs).toBe('EPSG:4326 horizontal, EGM96 geoid vertical');
      expect(res.metadata.source).toContain('Open-Meteo Elevation API (Multi-Source Global DEM Compilation');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('preserves null elevation and unavailable status on HTTP error without 0 fallback', async () => {
    const provider = new ElevationDataProvider();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Error',
      headers: new Headers(),
      text: async () => 'Database timeout'
    } as any);

    try {
      const res = await provider.fetch({ latitude: 51.4769, longitude: -0.0015 });
      expect(res.status).toBe('unavailable');
      expect(res.data).toBeNull(); // Strictly null, never 0!
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

    expect(calculatedCentroid[0]).not.toBe(vertex0.longitude);
    expect(calculatedCentroid[1]).not.toBe(vertex0.latitude);

    const centroidExpectedReport = inspectCoordinates(calculatedCentroid[0], calculatedCentroid[1]);
    const report = generateSiteIntelligenceReport(project, polyAnalysis);

    expect(report.primaryBoundary).toBeDefined();
    expect(report.primaryBoundary?.centroidDms).toBe(centroidExpectedReport.dmsFormatted);
    expect(report.primaryBoundary?.centroidDms).not.toBe(vertex0.dmsFormatted);
    expect(report.primaryBoundary?.centroidUtm).toBe(centroidExpectedReport.utm.formatted);
  });
});
