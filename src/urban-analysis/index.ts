/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Urban Context & Morphology Module (M2.0)
 */

import { UrbanContextSummary, ProvenancedMetric } from '../types';
import { datasetRegistry, OSMUrbanSummaryData } from '../data-providers';

/**
 * Queries OpenStreetMap Overpass API for real context elements around a site centroid
 * Delegates to the unified M2.0 DatasetRegistry and OSMDataProvider
 */
export async function fetchUrbanContext(
  latitude: number,
  longitude: number,
  radiusMeters: number = 300,
  options?: { signal?: AbortSignal; siteBoundary?: [number, number][]; bypassCache?: boolean }
): Promise<UrbanContextSummary> {
  try {
    const dataset = await datasetRegistry.fetch<OSMUrbanSummaryData>(
      'osm-overpass',
      {
        latitude,
        longitude,
        radiusMeters
      },
      {
        radiusMeters,
        center: [longitude, latitude],
        signal: options?.signal,
        siteBoundary: options?.siteBoundary,
        bypassCache: options?.bypassCache,
        timeoutMs: 16000
      }
    );

    if (dataset.status === 'unavailable' || dataset.status === 'error' || !dataset.data) {
      return {
        buildingCount: 0,
        roadCount: 0,
        amenityCount: 0,
        landuseCount: 0,
        sampledRadiusM: radiusMeters,
        source: `${dataset.metadata.source} (${dataset.status})`,
        loadedAt: dataset.metadata.retrievedAt,
        items: [],
        metrics: {
          urban_status: {
            id: 'urban-status',
            name: 'urban_context_status',
            label: 'Urban Context Service',
            value: dataset.error?.message || 'Overpass service unavailable or rate limited',
            formattedValue: dataset.status === 'unavailable' ? 'Offline / Rate Limited' : 'Query Failed',
            unit: 'status',
            classification: 'unavailable',
            source: dataset.metadata.source,
            calculationMethod: dataset.metadata.method,
            spatialResolution: dataset.metadata.spatialResolution,
            timestampOrReferencePeriod: dataset.metadata.retrievedAt,
            limitations: dataset.metadata.limitations,
            warning: dataset.error?.retryable ? 'Temporary server rate-limit. Query can be retried.' : undefined,
            category: 'urban'
          }
        }
      };
    }

    const data = dataset.data;
    const isTruncated = dataset.stats?.isTruncated || dataset.status === 'partial';

    const items: UrbanContextSummary['items'] = data.elementsSummary.map(el => ({
      category: el.category === 'building' ? 'Building' : (el.category === 'road' ? 'Transportation' : 'Amenity'),
      name: el.name,
      type: el.type
    }));

    const metrics: Record<string, ProvenancedMetric> = {
      osm_buildings_nearby: {
        id: 'urban-bldg-count',
        name: 'nearby_building_footprints',
        label: 'Adjacent Building Footprints',
        value: data.buildingCount,
        formattedValue: `${data.buildingCount} structures${isTruncated ? ' (partial)' : ''}`,
        unit: 'count',
        classification: 'dataset-derived',
        source: dataset.metadata.source,
        calculationMethod: `Radial spatial query with full vector geometry around centroid (${radiusMeters}m radius)`,
        spatialResolution: dataset.metadata.spatialResolution,
        timestampOrReferencePeriod: dataset.metadata.timestampOrReferencePeriod,
        limitations: isTruncated 
          ? 'Query reached response size cap. Additional structures exist beyond this sample.' 
          : dataset.metadata.limitations,
        warning: isTruncated ? 'Partial coverage: query truncated by server limit.' : undefined,
        category: 'urban'
      },
      osm_roads_nearby: {
        id: 'urban-roads-count',
        name: 'nearby_transportation_links',
        label: 'Surrounding Road Network Segments',
        value: data.roadCount,
        formattedValue: `${data.roadCount} segments`,
        unit: 'count',
        classification: 'dataset-derived',
        source: dataset.metadata.source,
        calculationMethod: `Highway tag enumeration with geometry within ${radiusMeters}m radius`,
        spatialResolution: 'Vector centerline polyline',
        timestampOrReferencePeriod: dataset.metadata.timestampOrReferencePeriod,
        limitations: 'Segments are partitioned at intersections and administrative boundaries; does not equate to unique continuous corridors.',
        category: 'urban'
      },
      osm_amenities_nearby: {
        id: 'urban-amenity-count',
        name: 'nearby_amenities_pois',
        label: 'Points of Interest & Amenities',
        value: data.amenityCount,
        formattedValue: `${data.amenityCount} POIs`,
        unit: 'count',
        classification: 'dataset-derived',
        source: dataset.metadata.source,
        calculationMethod: `Amenity node/way query within ${radiusMeters}m radius`,
        spatialResolution: 'Point and polygon tags',
        timestampOrReferencePeriod: dataset.metadata.timestampOrReferencePeriod,
        limitations: 'Subject to commercial registration and OpenStreetMap survey freshness.',
        category: 'urban'
      },
      pedestrian_accessibility_proxy: {
        id: 'urban-ped-proxy',
        name: 'pedestrian_permeability_proxy',
        label: 'Walkability & Permeability Indicator',
        value: data.roadCount > 15 ? 'High Connectivity' : (data.roadCount > 5 ? 'Moderate Connectivity' : 'Low Connectivity'),
        formattedValue: data.roadCount > 15 ? 'High (Dense urban fabric)' : (data.roadCount > 5 ? 'Moderate' : 'Low (Cul-de-sac / Sparse)'),
        unit: 'categorical proxy',
        classification: 'proxy',
        source: 'Morphological Street Density Heuristic',
        calculationMethod: `Calculated from road segment density (${data.roadCount} segments in ${(Math.PI * Math.pow(radiusMeters, 2) / 10000).toFixed(1)} ha)`,
        spatialResolution: `${radiusMeters}m buffer`,
        timestampOrReferencePeriod: 'Derived from live OSM geometry',
        limitations: 'PROXY INDICATOR: Does not represent empirical pedestrian footfall sensor data. True pedestrian activity depends on pavement quality, street vibrancy, microclimate, and demographic flows.',
        warning: 'Proxy metric: Not empirical footfall data.',
        category: 'urban'
      }
    };

    return {
      buildingCount: data.buildingCount,
      roadCount: data.roadCount,
      amenityCount: data.amenityCount,
      landuseCount: data.landuseCount,
      sampledRadiusM: radiusMeters,
      source: `${dataset.metadata.source} (${dataset.metadata.license.attributionStatement})`,
      loadedAt: dataset.metadata.retrievedAt,
      items,
      metrics
    };
  } catch (err: any) {
    return {
      buildingCount: 0,
      roadCount: 0,
      amenityCount: 0,
      landuseCount: 0,
      sampledRadiusM: radiusMeters,
      source: 'OpenStreetMap (Client Error)',
      loadedAt: new Date().toISOString(),
      items: [],
      metrics: {
        urban_status: {
          id: 'urban-status',
          name: 'urban_context_status',
          label: 'Urban Context Service',
          value: err.message || 'Unexpected failure querying urban context',
          formattedValue: 'Error',
          unit: 'status',
          classification: 'unavailable',
          source: 'OpenStreetMap Overpass',
          calculationMethod: 'Provider Query',
          spatialResolution: 'N/A',
          timestampOrReferencePeriod: new Date().toISOString(),
          limitations: 'Local client exception during query execution.',
          category: 'urban'
        }
      }
    };
  }
}
