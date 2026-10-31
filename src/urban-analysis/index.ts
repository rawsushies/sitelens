/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Urban Context & Morphology Module
 */

import { UrbanContextSummary, ProvenancedMetric } from '../types';

/**
 * Queries OpenStreetMap Overpass API for real context elements around a site centroid
 */
export async function fetchUrbanContext(
  latitude: number,
  longitude: number,
  radiusMeters: number = 300
): Promise<UrbanContextSummary> {
  // Bounded query for building footprints, roads, amenities
  const query = `
    [out:json][timeout:15];
    (
      way["building"](around:${radiusMeters},${latitude},${longitude});
      relation["building"](around:${radiusMeters},${latitude},${longitude});
      way["highway"](around:${radiusMeters},${latitude},${longitude});
      node["amenity"](around:${radiusMeters},${latitude},${longitude});
      way["amenity"](around:${radiusMeters},${latitude},${longitude});
      way["leisure"](around:${radiusMeters},${latitude},${longitude});
    );
    out tags 100;
  `;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Overpass API responded with status ${res.status}`);
    }

    const data = await res.json();
    const elements: any[] = data.elements || [];

    let buildingCount = 0;
    let roadCount = 0;
    let amenityCount = 0;
    let landuseCount = 0;

    const items: UrbanContextSummary['items'] = [];

    for (const el of elements) {
      const tags = el.tags || {};
      if (tags.building) {
        buildingCount++;
        if (tags.name && items.length < 15) {
          items.push({
            category: 'Building',
            name: tags.name,
            type: tags.building !== 'yes' ? tags.building : 'Structure',
          });
        }
      } else if (tags.highway) {
        roadCount++;
        if (tags.name && items.length < 25) {
          items.push({
            category: 'Transportation',
            name: tags.name,
            type: tags.highway,
          });
        }
      } else if (tags.amenity) {
        amenityCount++;
        if (items.length < 35) {
          items.push({
            category: 'Amenity',
            name: tags.name || tags.amenity,
            type: tags.amenity,
          });
        }
      } else if (tags.leisure || tags.landuse) {
        landuseCount++;
        if (items.length < 40) {
          items.push({
            category: 'Open Space',
            name: tags.name || tags.leisure || tags.landuse,
            type: tags.leisure || tags.landuse,
          });
        }
      }
    }

    const metrics: Record<string, ProvenancedMetric> = {
      osm_buildings_nearby: {
        id: 'urban-bldg-count',
        name: 'nearby_building_footprints',
        label: 'Adjacent Building Footprints',
        value: buildingCount,
        formattedValue: `${buildingCount} structures`,
        unit: 'count',
        classification: 'dataset-derived',
        source: 'OpenStreetMap (ODbL License via Overpass API)',
        calculationMethod: `Radial spatial query around centroid (${radiusMeters}m radius)`,
        spatialResolution: 'Vector polygon/multipolygon geometry',
        timestampOrReferencePeriod: 'Current OpenStreetMap live planet database',
        limitations: 'Crowdsourced volunteer mapping. Building heights, uses, and completion rates may vary depending on local contributor activity.',
        category: 'urban'
      },
      osm_roads_nearby: {
        id: 'urban-roads-count',
        name: 'nearby_transportation_links',
        label: 'Surrounding Road Network Segments',
        value: roadCount,
        formattedValue: `${roadCount} segments`,
        unit: 'count',
        classification: 'dataset-derived',
        source: 'OpenStreetMap via Overpass API',
        calculationMethod: `Highway tag enumeration within ${radiusMeters}m radius`,
        spatialResolution: 'Vector centerline polyline',
        timestampOrReferencePeriod: 'Current OpenStreetMap live database',
        limitations: 'Segments are partitioned at intersections and administrative boundaries; does not equate to unique continuous corridors.',
        category: 'urban'
      },
      osm_amenities_nearby: {
        id: 'urban-amenity-count',
        name: 'nearby_amenities_pois',
        label: 'Points of Interest & Amenities',
        value: amenityCount,
        formattedValue: `${amenityCount} POIs`,
        unit: 'count',
        classification: 'dataset-derived',
        source: 'OpenStreetMap POI database',
        calculationMethod: `Amenity node/way query within ${radiusMeters}m radius`,
        spatialResolution: 'Point and polygon tags',
        timestampOrReferencePeriod: 'Current OpenStreetMap',
        limitations: 'Subject to commercial registration and survey freshness.',
        category: 'urban'
      },
      pedestrian_accessibility_proxy: {
        id: 'urban-ped-proxy',
        name: 'pedestrian_permeability_proxy',
        label: 'Walkability & Permeability Indicator',
        value: roadCount > 15 ? 'High Connectivity' : (roadCount > 5 ? 'Moderate Connectivity' : 'Low Connectivity'),
        formattedValue: roadCount > 15 ? 'High (Dense urban fabric)' : (roadCount > 5 ? 'Moderate' : 'Low (Cul-de-sac / Sparse)'),
        unit: 'categorical proxy',
        classification: 'proxy',
        source: 'Morphological Street Density Heuristic',
        calculationMethod: `Calculated from road segment density (${roadCount} segments in ${(Math.PI * Math.pow(radiusMeters, 2) / 10000).toFixed(1)} ha)`,
        spatialResolution: `${radiusMeters}m buffer`,
        timestampOrReferencePeriod: 'Derived from current OSM',
        limitations: 'PROXY INDICATOR: Does not represent empirical pedestrian footfall sensor data. True pedestrian activity depends on pavement quality, street vibrancy, microclimate, and demographic flows.',
        warning: 'Proxy metric: Not empirical footfall data.',
        category: 'urban'
      }
    };

    return {
      buildingCount,
      roadCount,
      amenityCount,
      landuseCount,
      sampledRadiusM: radiusMeters,
      source: 'OpenStreetMap via Overpass API (ODbL)',
      loadedAt: new Date().toISOString(),
      items,
      metrics,
    };
  } catch (err: any) {
    return {
      buildingCount: 0,
      roadCount: 0,
      amenityCount: 0,
      landuseCount: 0,
      sampledRadiusM: radiusMeters,
      source: 'OpenStreetMap (Request Offline / Fallback)',
      loadedAt: new Date().toISOString(),
      items: [],
      metrics: {
        urban_status: {
          id: 'urban-status',
          name: 'urban_context_status',
          label: 'Urban Context Service',
          value: 'Overpass query timed out or unavailable',
          formattedValue: 'Offline / Query Limit',
          unit: 'status',
          classification: 'unavailable',
          source: 'Overpass API',
          calculationMethod: 'REST API Request',
          spatialResolution: 'N/A',
          timestampOrReferencePeriod: new Date().toISOString(),
          limitations: 'Public Overpass servers may experience rate limiting or heavy load. Can be re-queried at any time.',
          category: 'urban'
        }
      }
    };
  }
}
