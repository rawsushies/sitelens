/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Independent Terrain Elevation Provider (M2.0)
 */

import { IDataProvider, SpatialDataset, SpatialQueryOptions, DatasetMetadata, DatasetStatus } from '../types';
import { resilientFetch } from '../client';
import { ProvenancedMetric } from '../../types';

export interface ElevationQuery {
  latitude: number;
  longitude: number;
}

export interface ElevationData {
  latitude: number;
  longitude: number;
  elevationM: number | null;
  model: string | null;
  resolutionM: number | null;
  metric: ProvenancedMetric;
}

const ELEVATION_METADATA: DatasetMetadata = {
  id: 'open-meteo-elevation',
  title: 'Digital Elevation Model (DEM) Ground Surface Height',
  description: 'Surface ground elevation referenced to Mean Sea Level (EGM96 geoid / MSL vertical datum).',
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
  spatialResolution: 'Variable / unverified per-coordinate (Open-Meteo composite API does not return sub-model or cell resolution)',
  method: 'Bilinear interpolation from composite global DEM raster grid',
  crs: 'EPSG:4326 horizontal, EGM96 geoid vertical',
  units: {
    elevation: 'metres above sea level (m ASL)'
  },
  limitations: 'Composite raster DEM compilation. Open-Meteo does not return individual raster sub-model identification or exact cell resolution in API response payload. Surface heights are smoothed across the grid cell; not suitable as a legal boundary survey or architectural finished-floor datum.',
  retrievedAt: new Date().toISOString()
};

export class ElevationDataProvider implements IDataProvider<ElevationQuery, ElevationData> {
  readonly id = 'elevation-dem';
  readonly name = 'Terrain Elevation Provider';
  readonly defaultMetadata = ELEVATION_METADATA;

  async fetch(query: ElevationQuery, options: SpatialQueryOptions = {}): Promise<SpatialDataset<ElevationData>> {
    const lat = query.latitude;
    const lng = query.longitude;

    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}`;

    const res = await resilientFetch(url, {
      method: 'GET',
      timeoutMs: options.timeoutMs || 8000,
      retries: 2,
      signal: options.signal
    });

    const metadata: DatasetMetadata = {
      ...this.defaultMetadata,
      retrievedAt: new Date().toISOString()
    };

    if (!res.ok || !res.data) {
      return {
        id: `elevation-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        providerId: this.id,
        status: 'unavailable',
        metadata,
        data: null,
        error: res.error || {
          code: 'UNAVAILABLE',
          message: 'Elevation service unavailable.',
          retryable: true,
          timestamp: new Date().toISOString()
        }
      };
    }

    const payload = res.data;
    const rawElevation = Array.isArray(payload.elevation) ? payload.elevation[0] : payload.elevation;
    const hasElevation = typeof rawElevation === 'number' && !isNaN(rawElevation);

    if (!hasElevation) {
      return {
        id: `elevation-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        providerId: this.id,
        status: 'empty',
        metadata,
        data: null,
        error: {
          code: 'UNAVAILABLE',
          message: 'Elevation value missing from response.',
          retryable: false,
          timestamp: new Date().toISOString()
        }
      };
    }

    const elevationVal = Number(rawElevation);

    const metric: ProvenancedMetric = {
      id: 'climate-elevation',
      name: 'terrain_elevation',
      label: 'Estimated Surface Elevation',
      value: elevationVal,
      formattedValue: `${elevationVal.toFixed(1)} m ASL`,
      unit: 'm ASL',
      classification: 'dataset-derived',
      source: metadata.source,
      calculationMethod: metadata.method,
      spatialResolution: metadata.spatialResolution,
      timestampOrReferencePeriod: metadata.timestampOrReferencePeriod,
      limitations: metadata.limitations,
      category: 'terrain'
    };

    return {
      id: `elevation-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      providerId: this.id,
      status: 'success',
      metadata,
      data: {
        latitude: lat,
        longitude: lng,
        elevationM: elevationVal,
        model: null, // Open-Meteo elevation API payload does not identify the underlying DEM raster tileset
        resolutionM: null, // Open-Meteo elevation API payload does not specify cell resolution
        metric
      },
      metrics: {
        terrain_elevation: metric
      }
    };
  }
}
