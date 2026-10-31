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
  hasAntimeridianCrossing,
  unwrapRingAntimeridian
} from './spatial-filter';
import { OSMDataProvider, reconstructClosedRingsFromFragments } from './adapters/osm';
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

  it('generates normalized keys with stable parameter ordering', () => {
    const key1 = BoundedLRUCache.generateKey('osm', { lat: 51.47688812, lng: -0.00154321, radius: 300 });
    const key2 = BoundedLRUCache.generateKey('osm', { radius: 300, lng: -0.00154321, lat: 51.47688812 });
    expect(key1).toBe(key2);
  });

  it('prevents cache collisions for coordinates and boundaries differing by < 0.00001 degrees', () => {
    // 7th decimal place difference (0.0000001 deg ~11mm)
    const key1 = BoundedLRUCache.generateKey('osm', { lat: 51.4768881, lng: -0.0015432 });
    const key2 = BoundedLRUCache.generateKey('osm', { lat: 51.4768882, lng: -0.0015431 });
    expect(key1).not.toBe(key2);

    // Site boundaries differing by 0.000001 deg
    const boundaryA: [number, number][] = [
      [0.000001, 51.476000],
      [0.000001, 51.477000],
      [0.000010, 51.477000],
      [0.000010, 51.476000],
      [0.000001, 51.476000]
    ];
    const boundaryB: [number, number][] = [
      [0.000002, 51.476000],
      [0.000002, 51.477000],
      [0.000010, 51.477000],
      [0.000010, 51.476000],
      [0.000002, 51.476000]
    ];
    const keyBA = BoundedLRUCache.generateKey('osm', { q: 1 }, { siteBoundary: boundaryA });
    const keyBB = BoundedLRUCache.generateKey('osm', { q: 1 }, { siteBoundary: boundaryB });
    expect(keyBA).not.toBe(keyBB);
  });

  it('excludes transient execution parameters (signal, bypassCache, timeoutMs) from cache keys', () => {
    const controller = new AbortController();
    const keyClean = BoundedLRUCache.generateKey('osm', { lat: 51.4769, lng: -0.0015 });
    const keyTransient = BoundedLRUCache.generateKey('osm', { 
      lat: 51.4769, 
      lng: -0.0015,
      signal: controller.signal,
      bypassCache: true,
      timeoutMs: 5000 
    });
    expect(keyClean).toBe(keyTransient);
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

  it('cancels underlying network request when all active subscribers abort', async () => {
    const originalFetch = globalThis.fetch;
    let underlyingAborted = false;

    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          underlyingAborted = true;
        });
      }
      await new Promise(r => setTimeout(r, 60));
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
      const controller2 = new AbortController();

      const p1 = datasetRegistry.fetch('open-meteo-weather', { latitude: 51.4769, longitude: -0.0015 }, {
        signal: controller1.signal,
        bypassCache: true
      });
      const p2 = datasetRegistry.fetch('open-meteo-weather', { latitude: 51.4769, longitude: -0.0015 }, {
        signal: controller2.signal,
        bypassCache: true
      });

      controller1.abort();
      controller2.abort();

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.error?.code).toBe('ABORTED');
      expect(res2.error?.code).toBe('ABORTED');
      expect(underlyingAborted).toBe(true);
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

  it('unwraps coordinates across antimeridian without cross-ring state pollution', () => {
    // Eastward crossing: +179 to -179 -> -179 should unwrap to +181
    const eastCrossing: [number, number][] = [[179.0, 0.0], [-179.0, 0.0], [-178.0, 0.0]];
    const unwrappedEast = unwrapRingAntimeridian(eastCrossing);
    expect(unwrappedEast[0]).toEqual([179.0, 0.0]);
    expect(unwrappedEast[1][0]).toBe(181.0);
    expect(unwrappedEast[2][0]).toBe(182.0);

    // Westward crossing: -179 to +179 -> +179 should unwrap to -181
    const westCrossing: [number, number][] = [[-179.0, 0.0], [179.0, 0.0], [178.0, 0.0]];
    const unwrappedWest = unwrapRingAntimeridian(westCrossing);
    expect(unwrappedWest[0]).toEqual([-179.0, 0.0]);
    expect(unwrappedWest[1][0]).toBe(-181.0);
    expect(unwrappedWest[2][0]).toBe(-182.0);

    // Independent rings: ring 2 must not inherit offset from ring 1
    const ring1 = unwrapRingAntimeridian([[179.0, 0.0], [-179.0, 0.0]]);
    const ring2 = unwrapRingAntimeridian([[10.0, 0.0], [11.0, 0.0]]);
    expect(ring1[1][0]).toBe(181.0);
    expect(ring2[0][0]).toBe(10.0);
    expect(ring2[1][0]).toBe(11.0);

    // Exact +180 and -180 coordinates
    const exactMeridian: [number, number][] = [[180.0, 0.0], [-180.0, 0.0]];
    const unwrappedExact = unwrapRingAntimeridian(exactMeridian);
    expect(unwrappedExact[0]).toEqual([180.0, 0.0]);
    expect(unwrappedExact[1][0]).toBe(180.0);
  });

  it('guarantees original GeoJSON coordinates remain unchanged during spatial filtering (immutability)', () => {
    const originalCoords: [number, number][] = [[5, -5], [5, 15]];
    const lineFeature: Feature = {
      type: 'Feature',
      id: 'immutable-line',
      geometry: {
        type: 'LineString',
        coordinates: originalCoords
      },
      properties: {}
    };

    filterFeaturesBySiteBoundary([lineFeature], siteSquare);

    // Ensure coords array reference or inner points were not mutated
    expect((lineFeature.geometry as any).coordinates[0]).toEqual([5, -5]);
    expect((lineFeature.geometry as any).coordinates[1]).toEqual([5, 15]);
  });

  it('retains features whose boundary touches the site boundary edge', () => {
    // Polygon touching exactly at edge [10, 0] to [10, 10]
    const touchingPolygon: Feature = {
      type: 'Feature',
      id: 'touching-parcel',
      geometry: {
        type: 'Polygon',
        coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]]
      },
      properties: { name: 'Adjacent Parcel' }
    };

    const filtered = filterFeaturesBySiteBoundary([touchingPolygon], siteSquare);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('touching-parcel');
  });
});

describe('M2.0.2 OSM Overpass Multipolygon Relations & Ring Reconstruction (11 Regression Tests)', () => {
  it('1. reconstructs one outer ring composed of four fragmented ways', () => {
    const f1: [number, number][] = [[0, 0], [10, 0]];
    const f2: [number, number][] = [[10, 0], [10, 10]];
    const f3: [number, number][] = [[10, 10], [0, 10]];
    const f4: [number, number][] = [[0, 10], [0, 0]];

    const result = reconstructClosedRingsFromFragments([f1, f2, f3, f4]);
    expect(result.closedRings.length).toBe(1);
    expect(result.closedRings[0].length).toBe(5);
    expect(result.closedRings[0][0]).toEqual([0, 0]);
    expect(result.closedRings[0][4]).toEqual([0, 0]);
    expect(result.incompleteFragmentsCount).toBe(0);
    expect(result.invalidRingsCount).toBe(0);
  });

  it('2. reconstructs outer ring when fragments are supplied in reversed order', () => {
    const f1: [number, number][] = [[0, 0], [10, 0]];
    const f2: [number, number][] = [[10, 0], [10, 10]];
    const f3: [number, number][] = [[10, 10], [0, 10]];
    const f4: [number, number][] = [[0, 10], [0, 0]];

    const result = reconstructClosedRingsFromFragments([f4, f3, f2, f1]);
    expect(result.closedRings.length).toBe(1);
    expect(result.closedRings[0].length).toBe(5);
    expect(result.incompleteFragmentsCount).toBe(0);
  });

  it('3. reconstructs outer ring when fragment coordinate direction is reversed (endpoint matching in either orientation)', () => {
    const f1: [number, number][] = [[0, 0], [10, 0]];
    const f2: [number, number][] = [[10, 10], [10, 0]]; // Reversed direction: tail connects to f1 tail
    const f3: [number, number][] = [[10, 10], [0, 10]];
    const f4: [number, number][] = [[0, 0], [0, 10]];   // Reversed direction: tail connects to f3 tail

    const result = reconstructClosedRingsFromFragments([f1, f2, f3, f4]);
    expect(result.closedRings.length).toBe(1);
    expect(result.closedRings[0].length).toBe(5);
    expect(result.incompleteFragmentsCount).toBe(0);
  });

  it('4. reconstructs multiple independent outer rings', () => {
    // Ring A
    const a1: [number, number][] = [[0, 0], [5, 0]];
    const a2: [number, number][] = [[5, 0], [5, 5]];
    const a3: [number, number][] = [[5, 5], [0, 5]];
    const a4: [number, number][] = [[0, 5], [0, 0]];

    // Ring B
    const b1: [number, number][] = [[10, 10], [15, 10]];
    const b2: [number, number][] = [[15, 10], [15, 15]];
    const b3: [number, number][] = [[15, 15], [10, 15]];
    const b4: [number, number][] = [[10, 15], [10, 10]];

    const result = reconstructClosedRingsFromFragments([a1, b1, a2, b2, a3, b3, a4, b4]);
    expect(result.closedRings.length).toBe(2);
    expect(result.incompleteFragmentsCount).toBe(0);
    expect(result.invalidRingsCount).toBe(0);
  });

  it('5. reconstructs relation with one outer ring and one inner ring (donut polygon)', async () => {
    const provider = new OSMDataProvider();
    const mockElements = [
      {
        type: 'relation',
        id: 101,
        tags: { type: 'multipolygon', building: 'yes', name: 'Single Courtyard Building' },
        members: [
          {
            type: 'way',
            ref: 1001,
            role: 'outer',
            geometry: [
              { lat: 0, lon: 0 }, { lat: 10, lon: 0 }, { lat: 10, lon: 10 }, { lat: 0, lon: 10 }, { lat: 0, lon: 0 }
            ]
          },
          {
            type: 'way',
            ref: 1002,
            role: 'inner',
            geometry: [
              { lat: 2, lon: 2 }, { lat: 8, lon: 2 }, { lat: 8, lon: 8 }, { lat: 2, lon: 8 }, { lat: 2, lon: 2 }
            ]
          }
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
      const res = await provider.fetch({ latitude: 5, longitude: 5 });
      expect(res.status).toBe('success');
      const feat = res.featureCollection?.features[0];
      expect(feat?.geometry.type).toBe('Polygon');
      expect((feat?.geometry as any).coordinates.length).toBe(2); // 1 outer + 1 inner
      expect(feat?.properties?.holeCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('6. reconstructs relation with one outer ring and multiple inner rings', async () => {
    const provider = new OSMDataProvider();
    const mockElements = [
      {
        type: 'relation',
        id: 102,
        tags: { type: 'multipolygon', building: 'commercial', name: 'Dual Courtyard Complex' },
        members: [
          {
            type: 'way',
            ref: 2001,
            role: 'outer',
            geometry: [
              { lat: 0, lon: 0 }, { lat: 30, lon: 0 }, { lat: 30, lon: 30 }, { lat: 0, lon: 30 }, { lat: 0, lon: 0 }
            ]
          },
          {
            type: 'way',
            ref: 2002,
            role: 'inner',
            geometry: [
              { lat: 2, lon: 2 }, { lat: 8, lon: 2 }, { lat: 8, lon: 8 }, { lat: 2, lon: 8 }, { lat: 2, lon: 2 }
            ]
          },
          {
            type: 'way',
            ref: 2003,
            role: 'inner',
            geometry: [
              { lat: 12, lon: 12 }, { lat: 18, lon: 12 }, { lat: 18, lon: 18 }, { lat: 12, lon: 18 }, { lat: 12, lon: 12 }
            ]
          }
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
      const res = await provider.fetch({ latitude: 15, longitude: 15 });
      expect(res.status).toBe('success');
      const feat = res.featureCollection?.features[0];
      expect(feat?.geometry.type).toBe('Polygon');
      expect((feat?.geometry as any).coordinates.length).toBe(3); // 1 outer + 2 inners
      expect(feat?.properties?.holeCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('7. assigns holes to the correct containing outer ring when multiple outer rings exist', async () => {
    const provider = new OSMDataProvider();
    const mockElements = [
      {
        type: 'relation',
        id: 103,
        tags: { type: 'multipolygon', building: 'yes', name: 'Twin Atrium Pavilion' },
        members: [
          // Outer A at [0, 0] to [10, 10]
          {
            type: 'way',
            ref: 3001,
            role: 'outer',
            geometry: [
              { lat: 0, lon: 0 }, { lat: 10, lon: 0 }, { lat: 10, lon: 10 }, { lat: 0, lon: 10 }, { lat: 0, lon: 0 }
            ]
          },
          // Hole A at [2, 2] to [8, 8] inside Outer A
          {
            type: 'way',
            ref: 3002,
            role: 'inner',
            geometry: [
              { lat: 2, lon: 2 }, { lat: 8, lon: 2 }, { lat: 8, lon: 8 }, { lat: 2, lon: 8 }, { lat: 2, lon: 2 }
            ]
          },
          // Outer B at [20, 20] to [30, 30]
          {
            type: 'way',
            ref: 3003,
            role: 'outer',
            geometry: [
              { lat: 20, lon: 20 }, { lat: 30, lon: 20 }, { lat: 30, lon: 30 }, { lat: 20, lon: 30 }, { lat: 20, lon: 20 }
            ]
          },
          // Hole B at [22, 22] to [28, 28] inside Outer B
          {
            type: 'way',
            ref: 3004,
            role: 'inner',
            geometry: [
              { lat: 22, lon: 22 }, { lat: 28, lon: 22 }, { lat: 28, lon: 28 }, { lat: 22, lon: 28 }, { lat: 22, lon: 22 }
            ]
          }
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
      const res = await provider.fetch({ latitude: 15, longitude: 15 });
      expect(res.status).toBe('success');
      const feat = res.featureCollection?.features[0];
      expect(feat?.geometry.type).toBe('MultiPolygon');
      const multiCoords = (feat?.geometry as any).coordinates;
      expect(multiCoords.length).toBe(2); // 2 polygon parts
      expect(multiCoords[0].length).toBe(2); // Polygon 0 has 1 outer and 1 hole
      expect(multiCoords[1].length).toBe(2); // Polygon 1 has 1 outer and 1 hole
      expect(feat?.properties?.outerCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('8. detects open or incomplete ring without creating an artificial closing edge', () => {
    // 3 segments of a square, missing the closing edge from [0, 10] to [0, 0]
    const f1: [number, number][] = [[0, 0], [10, 0]];
    const f2: [number, number][] = [[10, 0], [10, 10]];
    const f3: [number, number][] = [[10, 10], [0, 10]];

    const result = reconstructClosedRingsFromFragments([f1, f2, f3]);
    expect(result.closedRings.length).toBe(0); // MUST NOT artificially close with a fake edge
    expect(result.incompleteFragmentsCount).toBe(1);
  });

  it('9. deduplicates member ways so they are not returned twice', async () => {
    const provider = new OSMDataProvider();
    const mockElements = [
      {
        type: 'relation',
        id: 9901,
        tags: { type: 'multipolygon', building: 'university', name: 'Academic Quadrangle' },
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
          }
        ]
      },
      // Way 501 also present as standalone way element
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
      expect(res.data?.buildingCount).toBe(1);
      expect(res.data?.diagnostics.deduplicatedWaysCount).toBe(1);
      // Feature collection has only the relation, not the redundant member way
      expect(res.featureCollection?.features.length).toBe(1);
      expect(res.featureCollection?.features[0].id).toBe('osm-relation-9901');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('10. detects and rejects invalid or degenerate rings with fewer than 3 distinct vertices', () => {
    // Degenerate line back-and-forth (only 2 distinct vertices)
    const degenerateLine: [number, number][] = [[0, 0], [5, 5], [0, 0]];
    // Single-point segment
    const singlePoint: [number, number][] = [[0, 0]];

    const result = reconstructClosedRingsFromFragments([degenerateLine, singlePoint]);
    expect(result.closedRings.length).toBe(0);
    expect(result.invalidRingsCount).toBe(2);
  });

  it('11. gracefully handles relation with missing or unsupported members without crash', async () => {
    const provider = new OSMDataProvider();
    const mockElements = [
      {
        type: 'relation',
        id: 9999,
        tags: { type: 'multipolygon', building: 'yes' },
        members: [
          // Missing geometry
          { type: 'way', ref: 801, role: 'outer' },
          // Node member (not a way)
          { type: 'node', ref: 901, role: 'admin_centre', lat: 51.476, lon: -0.002 }
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
      expect(res.status).toBe('empty');
      expect(res.data?.diagnostics.incompleteRelationsCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('12. reconstructs an inner courtyard hole composed of multiple fragmented ways', () => {
    // 4 fragments forming an inner courtyard hole inside an outer perimeter
    const h1: [number, number][] = [[2, 2], [8, 2]];
    const h2: [number, number][] = [[8, 2], [8, 8]];
    const h3: [number, number][] = [[8, 8], [2, 8]];
    const h4: [number, number][] = [[2, 8], [2, 2]];

    const result = reconstructClosedRingsFromFragments([h1, h2, h3, h4]);
    expect(result.closedRings.length).toBe(1);
    expect(result.closedRings[0].length).toBe(5);
    expect(result.incompleteFragmentsCount).toBe(0);
    expect(result.invalidRingsCount).toBe(0);
  });

  it('13. handles complex shuffled fragments with reversed directions without artificial edges', () => {
    // Shuffled segments of a hexagon
    const s1: [number, number][] = [[0, 0], [4, 0]];
    const s2: [number, number][] = [[6, 3], [4, 0]]; // reversed
    const s3: [number, number][] = [[6, 3], [4, 6]];
    const s4: [number, number][] = [[0, 6], [4, 6]]; // reversed
    const s5: [number, number][] = [[0, 6], [-2, 3]];
    const s6: [number, number][] = [[0, 0], [-2, 3]]; // reversed

    const result = reconstructClosedRingsFromFragments([s3, s1, s6, s2, s5, s4]);
    expect(result.closedRings.length).toBe(1);
    expect(result.closedRings[0].length).toBe(7);
    expect(result.incompleteFragmentsCount).toBe(0);
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

describe('M2.0.2 Weather & Elevation Provenance Disclosures', () => {
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

  it('documents multi-source DEM compilation and EGM96 geoid without falsely claiming 90m certified reading or Copernicus model', async () => {
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
      // Strictly verify no fabricated model or resolution is claimed
      expect(res.data?.model).toBeNull();
      expect(res.data?.resolutionM).toBeNull();
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
