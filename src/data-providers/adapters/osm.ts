/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - OpenStreetMap Overpass Provider (M2.0)
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
  features: Feature[];
  elementsSummary: {
    category: string;
    name: string;
    type?: string;
    osmId: number;
  }[];
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

export class OSMDataProvider implements IDataProvider<OSMQuery, OSMUrbanSummaryData> {
  readonly id = 'osm-overpass';
  readonly name = 'OpenStreetMap Overpass Provider';
  readonly defaultMetadata = OSM_METADATA;

  /**
   * Fetches real vector geometry and attributes from OpenStreetMap Overpass
   */
  async fetch(query: OSMQuery, options: SpatialQueryOptions = {}): Promise<SpatialDataset<OSMUrbanSummaryData>> {
    const radius = Math.min(Math.max(query.radiusMeters || 350, 50), 1500);
    const lat = query.latitude;
    const lng = query.longitude;

    // Overpass query with body and geometry
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

    // Try primary and fallback endpoints
    for (const endpoint of OVERPASS_ENDPOINTS) {
      endpointUsed = endpoint;
      const res = await resilientFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
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
    const isTruncated = Boolean(rawData.remark && rawData.remark.includes('timed out'));

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
          features: [],
          elementsSummary: []
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

    // Assemble real GeoJSON Features from Overpass elements with geometry
    const rawFeatures: Feature[] = [];
    let buildingCount = 0;
    let roadCount = 0;
    let amenityCount = 0;
    let landuseCount = 0;
    const summaryItems: OSMUrbanSummaryData['elementsSummary'] = [];

    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name || tags['addr:housename'] || tags['addr:street'] ? `${tags.name || ''} ${tags['addr:housenumber'] || ''}`.trim() : null;

      if (tags.building) {
        buildingCount++;
        // Assemble polygon from way geometry
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
        roadCount++;
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
        amenityCount++;
        let geom: Geometry | null = null;
        if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
          geom = { type: 'Point', coordinates: [el.lon, el.lat] };
        } else if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length > 0) {
          // Centroid approximation from vertices
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
        landuseCount++;
      }
    }

    // Apply spatial site boundary filter if requested
    const filteredFeatures = options.siteBoundary
      ? filterFeaturesBySiteBoundary(rawFeatures, options.siteBoundary)
      : rawFeatures;

    const status: DatasetStatus = isTruncated 
      ? 'partial' 
      : filteredFeatures.length === 0 ? 'empty' : 'success';

    return {
      id: `osm-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      providerId: this.id,
      status,
      metadata,
      data: {
        buildingCount,
        roadCount,
        amenityCount,
        landuseCount,
        features: filteredFeatures,
        elementsSummary: summaryItems
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
