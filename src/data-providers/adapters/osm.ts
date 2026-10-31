/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - OpenStreetMap Overpass Provider (M2.0.2)
 */

import { IDataProvider, SpatialDataset, SpatialQueryOptions, DatasetMetadata, DatasetStatus } from '../types';
import { resilientFetch } from '../client';
import { filterFeaturesBySiteBoundary, isPointInPolygon } from '../spatial-filter';
import type { Feature, Geometry } from 'geojson';

export interface OSMQuery {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface OSMDiagnostics {
  relationsProcessed: number;
  relationsReconstructed: number;
  incompleteRelationsCount: number;
  invalidRingsCount: number;
  unassignedInnerRingsCount: number;
  deduplicatedWaysCount: number;
}

export interface OSMUrbanSummaryData {
  buildingCount: number;
  roadCount: number;
  amenityCount: number;
  landuseCount: number;
  queriedTotals: {
    buildings: number;
    roads: number;
    amenities: number;
    landuse: number;
  };
  features: Feature[];
  elementsSummary: {
    category: string;
    name: string;
    type?: string;
    osmId: number;
  }[];
  diagnostics: OSMDiagnostics;
}

const OSM_METADATA: DatasetMetadata = {
  id: 'osm-overpass-vector',
  title: 'OpenStreetMap Urban Context & Footprint Geometry',
  description: 'Real building footprints, street centerlines, and civic amenity points from the OpenStreetMap collaborative geodatabase.',
  source: 'OpenStreetMap via Overpass API',
  sourceUrl: 'https://www.openstreetmap.org',
  license: {
    id: 'ODbL-1.0',
    name: 'Open Database License (ODbL)',
    url: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attributionStatement: '© OpenStreetMap contributors',
    requiresAttribution: true,
    commercialUseAllowed: true,
  },
  attribution: 'Data © OpenStreetMap contributors (ODbL 1.0)',
  timestampOrReferencePeriod: 'Live OpenStreetMap Planet Database',
  spatialResolution: 'Variable vector survey resolution (~0.1m - 5m ground accuracy)',
  method: 'Overpass QL recursive geometric query (ways, relations, nodes with body geom)',
  crs: 'EPSG:4326 (WGS84 ellipsoidal coordinates)',
  units: {
    area: 'm²',
    distance: 'meters',
    levels: 'count',
    height: 'meters'
  },
  limitations: 'Completeness depends on volunteer mapping contributions in the locality. Building heights and level counts may be unmapped for certain parcels.',
  retrievedAt: new Date().toISOString()
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

function coordEquals(p1: [number, number], p2: [number, number], tolerance: number = 1e-7): boolean {
  return Math.abs(p1[0] - p2[0]) <= tolerance && Math.abs(p1[1] - p2[1]) <= tolerance;
}

export interface ReconstructedRingsResult {
  closedRings: [number, number][][];
  incompleteFragmentsCount: number;
  invalidRingsCount: number;
}

/**
 * Reconstructs closed rings from member way fragments.
 * Joins fragments by matching endpoints in either orientation, reverses fragments
 * when necessary, validates distinct vertices, and detects open/incomplete chains
 * without artificially forcing closure.
 */
export function reconstructClosedRingsFromFragments(
  rawFragments: [number, number][][]
): ReconstructedRingsResult {
  const closedRings: [number, number][][] = [];
  let invalidRingsCount = 0;
  let incompleteFragmentsCount = 0;

  // Clone fragments into active pool
  const pool: [number, number][][] = [];
  for (const frag of rawFragments) {
    if (!frag || frag.length < 2) {
      invalidRingsCount++;
      continue;
    }

    // Check if fragment is already a closed ring
    if (coordEquals(frag[0], frag[frag.length - 1])) {
      const distinctCount = new Set(frag.map(p => `${p[0]},${p[1]}`)).size;
      if (distinctCount >= 3) {
        closedRings.push([...frag]);
      } else {
        invalidRingsCount++;
      }
    } else {
      pool.push([...frag]);
    }
  }

  // Connect open fragments
  while (pool.length > 0) {
    const current = [...pool.shift()!];
    let extended = true;

    while (extended && !coordEquals(current[0], current[current.length - 1])) {
      extended = false;
      const head = current[0];
      const tail = current[current.length - 1];

      for (let i = 0; i < pool.length; i++) {
        const candidate = pool[i];
        const cHead = candidate[0];
        const cTail = candidate[candidate.length - 1];

        if (coordEquals(tail, cHead)) {
          // Append candidate
          current.push(...candidate.slice(1));
          pool.splice(i, 1);
          extended = true;
          break;
        } else if (coordEquals(tail, cTail)) {
          // Reverse candidate and append
          const reversed = [...candidate].reverse();
          current.push(...reversed.slice(1));
          pool.splice(i, 1);
          extended = true;
          break;
        } else if (coordEquals(head, cTail)) {
          // Prepend candidate
          current.unshift(...candidate.slice(0, candidate.length - 1));
          pool.splice(i, 1);
          extended = true;
          break;
        } else if (coordEquals(head, cHead)) {
          // Reverse candidate and prepend
          const reversed = [...candidate].reverse();
          current.unshift(...reversed.slice(0, reversed.length - 1));
          pool.splice(i, 1);
          extended = true;
          break;
        }
      }
    }

    if (coordEquals(current[0], current[current.length - 1])) {
      const distinctCount = new Set(current.map(p => `${p[0]},${p[1]}`)).size;
      if (distinctCount >= 3) {
        closedRings.push(current);
      } else {
        invalidRingsCount++;
      }
    } else {
      // Unclosed chain: do NOT artificially close with a fake edge
      incompleteFragmentsCount++;
    }
  }

  return {
    closedRings,
    incompleteFragmentsCount,
    invalidRingsCount
  };
}

export class OSMDataProvider implements IDataProvider<OSMQuery, OSMUrbanSummaryData> {
  readonly id = 'osm-overpass';
  readonly name = 'OpenStreetMap Overpass Provider';
  readonly defaultMetadata = OSM_METADATA;

  async fetch(query: OSMQuery, options: SpatialQueryOptions = {}): Promise<SpatialDataset<OSMUrbanSummaryData>> {
    const radius = Math.min(Math.max(query.radiusMeters || 350, 50), 1500);
    const lat = query.latitude;
    const lng = query.longitude;

    const overpassQL = `
      [out:json][timeout:18];
      (
        way["building"](around:${radius},${lat},${lng});
        relation["building"]["type"="multipolygon"](around:${radius},${lat},${lng});
        way["highway"](around:${radius},${lat},${lng});
        node["amenity"](around:${radius},${lat},${lng});
        way["amenity"](around:${radius},${lat},${lng});
        way["leisure"](around:${radius},${lat},${lng});
      );
      out body geom 150;
    `.trim();

    let lastError: any = null;
    let rawData: any = null;
    let endpointUsed = OVERPASS_ENDPOINTS[0];

    // Try primary and fallback endpoints with user agent header and rate limit awareness
    for (const endpoint of OVERPASS_ENDPOINTS) {
      endpointUsed = endpoint;
      const res = await resilientFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SiteLens-Geospatial-Workstation/2.0 (OpenStreetMap ODbL Consumer)'
        },
        body: `data=${encodeURIComponent(overpassQL)}`,
        timeoutMs: options.timeoutMs || 15000,
        retries: 1,
        signal: options.signal
      });

      if (res.ok && res.data) {
        rawData = res.data;
        break;
      }
      lastError = res.error;
    }

    const metadata: DatasetMetadata = {
      ...this.defaultMetadata,
      source: `OpenStreetMap via Overpass (${new URL(endpointUsed).hostname})`,
      retrievedAt: new Date().toISOString()
    };

    if (!rawData) {
      const isRateLimited = lastError?.code === 'RATE_LIMITED' || lastError?.statusCode === 429;
      return {
        id: `osm-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        providerId: this.id,
        status: isRateLimited ? 'unavailable' : 'error',
        metadata,
        data: null,
        error: lastError || {
          code: 'UNAVAILABLE',
          message: 'Overpass endpoints failed to return urban vector data.',
          retryable: true,
          timestamp: new Date().toISOString()
        }
      };
    }

    const elements: any[] = rawData.elements || [];
    const remark: string = rawData.remark || '';
    const isTruncated = remark.includes('timed out') || 
                        remark.includes('out of memory') || 
                        remark.includes('quota') ||
                        elements.length >= 150;

    const diagnostics: OSMDiagnostics = {
      relationsProcessed: 0,
      relationsReconstructed: 0,
      incompleteRelationsCount: 0,
      invalidRingsCount: 0,
      unassignedInnerRingsCount: 0,
      deduplicatedWaysCount: 0
    };

    if (elements.length === 0) {
      return {
        id: `osm-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        providerId: this.id,
        status: 'empty',
        metadata,
        data: {
          buildingCount: 0,
          roadCount: 0,
          amenityCount: 0,
          landuseCount: 0,
          queriedTotals: { buildings: 0, roads: 0, amenities: 0, landuse: 0 },
          features: [],
          elementsSummary: [],
          diagnostics
        },
        featureCollection: {
          type: 'FeatureCollection',
          features: []
        },
        stats: {
          totalElements: 0,
          retainedElements: 0,
          isTruncated: false
        }
      };
    }

    // Pass 1: Collect relation member way IDs to deduplicate features
    const relationMemberWayIds = new Set<number>();
    const relations = elements.filter(el => el.type === 'relation');
    for (const rel of relations) {
      if (Array.isArray(rel.members)) {
        for (const m of rel.members) {
          if (m.type === 'way' && m.ref) {
            relationMemberWayIds.add(m.ref);
          }
        }
      }
    }

    const rawFeatures: Feature[] = [];
    const summaryItems: OSMUrbanSummaryData['elementsSummary'] = [];

    let rawBuildingCount = 0;
    let rawRoadCount = 0;
    let rawAmenityCount = 0;
    let rawLanduseCount = 0;

    // Pass 2: Reconstruct relations (Multipolygon buildings with fragmented ways and holes)
    for (const rel of relations) {
      const tags = rel.tags || {};
      const name = tags.name || tags['addr:housename'] || null;

      if (tags.building || tags.type === 'multipolygon') {
        diagnostics.relationsProcessed++;

        const members: any[] = Array.isArray(rel.members) ? rel.members : [];
        const outerFragments: [number, number][][] = [];
        const innerFragments: [number, number][][] = [];

        for (const m of members) {
          if (Array.isArray(m.geometry) && m.geometry.length >= 2) {
            const coords: [number, number][] = m.geometry.map((pt: any) => [pt.lon, pt.lat]);
            if (m.role === 'inner') {
              innerFragments.push(coords);
            } else {
              // Default to outer if role is 'outer' or unspecified
              outerFragments.push(coords);
            }
          }
        }

        const outerResult = reconstructClosedRingsFromFragments(outerFragments);
        const innerResult = reconstructClosedRingsFromFragments(innerFragments);

        diagnostics.invalidRingsCount += (outerResult.invalidRingsCount + innerResult.invalidRingsCount);

        if (outerResult.closedRings.length === 0) {
          diagnostics.incompleteRelationsCount++;
          continue; // Incomplete relation: no valid outer ring could be formed
        }

        // Assign inner rings (holes) to their containing outer ring
        const outerRingsWithHoles: { outer: [number, number][]; holes: [number, number][][] }[] = 
          outerResult.closedRings.map(outer => ({ outer, holes: [] }));

        for (const innerRing of innerResult.closedRings) {
          let assigned = false;
          // Check which outer ring contains this inner ring
          for (const item of outerRingsWithHoles) {
            if (isPointInPolygon(innerRing[0], item.outer)) {
              item.holes.push(innerRing);
              assigned = true;
              break;
            }
          }
          if (!assigned) {
            diagnostics.unassignedInnerRingsCount++;
          }
        }

        // Successfully reconstructed
        diagnostics.relationsReconstructed++;
        rawBuildingCount++;

        if (outerRingsWithHoles.length === 1) {
          // Single outer polygon
          const polyCoords = [outerRingsWithHoles[0].outer, ...outerRingsWithHoles[0].holes];
          rawFeatures.push({
            type: 'Feature',
            id: `osm-relation-${rel.id}`,
            geometry: {
              type: 'Polygon',
              coordinates: polyCoords
            },
            properties: {
              osmId: rel.id,
              osmType: 'relation',
              featureType: 'building',
              isMultipolygon: true,
              holeCount: outerRingsWithHoles[0].holes.length,
              name: name || `Building Complex #${rel.id}`,
              buildingType: tags.building !== 'yes' ? (tags.building || 'multipolygon') : 'complex',
              height: tags.height ? parseFloat(tags.height) : undefined,
              levels: tags['building:levels'] ? parseInt(tags['building:levels'], 10) : undefined,
              tags
            }
          });
        } else {
          // Multiple outer polygons -> MultiPolygon
          const multiPolyCoords = outerRingsWithHoles.map(item => [item.outer, ...item.holes]);
          rawFeatures.push({
            type: 'Feature',
            id: `osm-relation-${rel.id}`,
            geometry: {
              type: 'MultiPolygon',
              coordinates: multiPolyCoords
            },
            properties: {
              osmId: rel.id,
              osmType: 'relation',
              featureType: 'building',
              isMultipolygon: true,
              outerCount: outerRingsWithHoles.length,
              name: name || `Building Multi-Complex #${rel.id}`,
              buildingType: tags.building || 'multipolygon',
              tags
            }
          });
        }

        if (summaryItems.length < 50) {
          summaryItems.push({
            category: 'building',
            name: name || `Building Complex (#${rel.id})`,
            type: tags.building || 'multipolygon',
            osmId: rel.id
          });
        }
      }
    }

    // Pass 3: Process ways and nodes (deduplicating member ways already absorbed into relations)
    for (const el of elements) {
      if (el.type === 'relation') continue; // already processed in Pass 2

      const tags = el.tags || {};
      const name = tags.name || tags['addr:housename'] || tags['addr:street'] ? `${tags.name || ''} ${tags['addr:housenumber'] || ''}`.trim() : null;

      if (tags.building) {
        // Feature deduplication: avoid adding way if already represented by parent relation
        if (relationMemberWayIds.has(el.id)) {
          diagnostics.deduplicatedWaysCount++;
          continue;
        }

        rawBuildingCount++;

        if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3) {
          const ring: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
          // Enforce ring closure
          if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
            ring.push([...ring[0]]);
          }

          rawFeatures.push({
            type: 'Feature',
            id: `osm-way-${el.id}`,
            geometry: {
              type: 'Polygon',
              coordinates: [ring]
            },
            properties: {
              osmId: el.id,
              osmType: 'way',
              featureType: 'building',
              name: name || `Building #${el.id}`,
              buildingType: tags.building !== 'yes' ? tags.building : 'unclassified',
              height: tags.height ? parseFloat(tags.height) : undefined,
              levels: tags['building:levels'] ? parseInt(tags['building:levels'], 10) : undefined,
              tags
            }
          });
        }

        if (summaryItems.length < 50) {
          summaryItems.push({
            category: 'building',
            name: name || `Building (${tags.building})`,
            type: tags.building,
            osmId: el.id
          });
        }
      } else if (tags.highway) {
        rawRoadCount++;

        if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
          const coords: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
          rawFeatures.push({
            type: 'Feature',
            id: `osm-way-${el.id}`,
            geometry: {
              type: 'LineString',
              coordinates: coords
            },
            properties: {
              osmId: el.id,
              osmType: 'way',
              featureType: 'road',
              name: tags.name || `${tags.highway} road`,
              highwayType: tags.highway,
              surface: tags.surface,
              tags
            }
          });
        }

        if (summaryItems.length < 50) {
          summaryItems.push({
            category: 'road',
            name: tags.name || `Road (${tags.highway})`,
            type: tags.highway,
            osmId: el.id
          });
        }
      } else if (tags.amenity) {
        rawAmenityCount++;

        let geom: Geometry | null = null;
        if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
          geom = { type: 'Point', coordinates: [el.lon, el.lat] };
        } else if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length > 0) {
          const avgLng = el.geometry.reduce((s: number, p: any) => s + p.lon, 0) / el.geometry.length;
          const avgLat = el.geometry.reduce((s: number, p: any) => s + p.lat, 0) / el.geometry.length;
          geom = { type: 'Point', coordinates: [avgLng, avgLat] };
        }

        if (geom) {
          rawFeatures.push({
            type: 'Feature',
            id: `osm-${el.type}-${el.id}`,
            geometry: geom,
            properties: {
              osmId: el.id,
              osmType: el.type,
              featureType: 'amenity',
              name: tags.name || tags.amenity,
              amenityType: tags.amenity,
              tags
            }
          });
        }

        if (summaryItems.length < 50) {
          summaryItems.push({
            category: 'amenity',
            name: tags.name || `Amenity (${tags.amenity})`,
            type: tags.amenity,
            osmId: el.id
          });
        }
      } else if (tags.leisure || tags.landuse) {
        rawLanduseCount++;
      }
    }

    // Apply spatial site boundary filter if requested
    const filteredFeatures = options.siteBoundary
      ? filterFeaturesBySiteBoundary(rawFeatures, options.siteBoundary)
      : rawFeatures;

    // Feature and count consistency
    const retainedBuildings = filteredFeatures.filter(f => f.properties?.featureType === 'building').length;
    const retainedRoads = filteredFeatures.filter(f => f.properties?.featureType === 'road').length;
    const retainedAmenities = filteredFeatures.filter(f => f.properties?.featureType === 'amenity').length;

    const buildingCount = options.siteBoundary ? retainedBuildings : rawBuildingCount;
    const roadCount = options.siteBoundary ? retainedRoads : rawRoadCount;
    const amenityCount = options.siteBoundary ? retainedAmenities : rawAmenityCount;
    const landuseCount = rawLanduseCount;

    const status: DatasetStatus = isTruncated 
      ? 'partial' 
      : filteredFeatures.length === 0 ? 'empty' : 'success';

    return {
      id: `osm-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      providerId: this.id,
      status,
      metadata: {
        ...metadata,
        limitations: isTruncated 
          ? 'PARTIAL COVERAGE: Overpass response was truncated by server limits. Some elements in the buffer may be missing.' 
          : metadata.limitations
      },
      data: {
        buildingCount,
        roadCount,
        amenityCount,
        landuseCount,
        queriedTotals: {
          buildings: rawBuildingCount,
          roads: rawRoadCount,
          amenities: rawAmenityCount,
          landuse: rawLanduseCount
        },
        features: filteredFeatures,
        elementsSummary: summaryItems,
        diagnostics
      },
      featureCollection: {
        type: 'FeatureCollection',
        features: filteredFeatures
      },
      stats: {
        totalElements: elements.length,
        retainedElements: filteredFeatures.length,
        isTruncated
      }
    };
  }
}
