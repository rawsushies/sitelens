/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - OpenStreetMap Overpass Provider (M2.0.1)
 */

import { IDataProvider, SpatialDataset, SpatialQueryOptions, DatasetMetadata, DatasetStatus } from '../types';
import { resilientFetch } from '../client';
import { filterFeaturesBySiteBoundary } from '../spatial-filter';
import type { Feature, Geometry } from 'geojson';

export interface OSMQuery {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
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
  diagnostics: {
    incompleteGeometriesCount: number;
    relationsProcessed: number;
    deduplicatedWaysCount: number;
  };
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

/**
 * Assembles closed rings from Overpass relation member ways
 */
function assembleRingsFromMembers(members: any[], role: 'outer' | 'inner'): [number, number][][] {
  const filtered = members.filter(m => m.role === role && Array.isArray(m.geometry) && m.geometry.length >= 2);
  const rings: [number, number][][] = [];

  for (const item of filtered) {
    const coords: [number, number][] = item.geometry.map((pt: any) => [pt.lon, pt.lat]);
    if (coords.length >= 3) {
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([...coords[0]]);
      }
      rings.push(coords);
    }
  }

  return rings;
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
          diagnostics: { incompleteGeometriesCount: 0, relationsProcessed: 0, deduplicatedWaysCount: 0 }
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
    let incompleteCount = 0;
    let relationsProcessed = 0;
    let deduplicatedWaysCount = 0;

    let rawBuildingCount = 0;
    let rawRoadCount = 0;
    let rawAmenityCount = 0;
    let rawLanduseCount = 0;

    // Pass 2: Process relations (Multipolygon buildings with holes)
    for (const rel of relations) {
      const tags = rel.tags || {};
      const name = tags.name || tags['addr:housename'] || null;

      if (tags.building || tags.type === 'multipolygon') {
        rawBuildingCount++;
        relationsProcessed++;

        const outerRings = assembleRingsFromMembers(rel.members || [], 'outer');
        const innerRings = assembleRingsFromMembers(rel.members || [], 'inner');

        if (outerRings.length === 1) {
          // Single outer polygon with 0 or more inner holes
          const polyCoords = [outerRings[0], ...innerRings];
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
              holeCount: innerRings.length,
              name: name || `Building Complex #${rel.id}`,
              buildingType: tags.building !== 'yes' ? (tags.building || 'multipolygon') : 'complex',
              height: tags.height ? parseFloat(tags.height) : undefined,
              levels: tags['building:levels'] ? parseInt(tags['building:levels'], 10) : undefined,
              tags
            }
          });
        } else if (outerRings.length > 1) {
          // Multiple outer polygons -> MultiPolygon
          const multiPolyCoords = outerRings.map(outer => [outer]);
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
              outerCount: outerRings.length,
              name: name || `Building Multi-Complex #${rel.id}`,
              buildingType: tags.building || 'multipolygon',
              tags
            }
          });
        } else {
          incompleteCount++;
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
          deduplicatedWaysCount++;
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
        } else {
          incompleteCount++;
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
        } else {
          incompleteCount++;
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
        } else {
          incompleteCount++;
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

    // Feature and count consistency:
    // If filtered by site boundary, count the retained features directly
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
        diagnostics: {
          incompleteGeometriesCount: incompleteCount,
          relationsProcessed,
          deduplicatedWaysCount
        }
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
