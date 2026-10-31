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
  model: string;
  resolutionM: number;
  metric: ProvenancedMetric;
}

const ELEVATION_METADATA: DatasetMetadata = {
  id: 'open-meteo-elevation',
  title: 'Copernicus / SRTM High-Resolution Digital Elevation Model (DEM)',
  description: 'Surface ground elevation referenced to Mean Sea Level (EGM96 geoid / WGS84 vertical datum).',
  source: 'Copernicus DEM GLO-90 / SRTM 90m via Open-Meteo Elevation API',
  sourceUrl: 'https://open-meteo.com/en/docs/elevation-api',
  license: {
    id: 'Copernicus-Open-Access',
    name: 'Copernicus Open Access / Public Domain',
    url: 'https://spacedata.copernicus.eu/',
    attributionStatement: 'European Space Agency (ESA) Copernicus DEM',
    requiresAttribution: true,
    commercialUseAllowed: true,
  },
  attribution: 'Elevation data © European Space Agency Copernicus DEM (90m)',
  timestampOrReferencePeriod: 'Copernicus GLO-90 Baseline (2020 Release)',
  spatialResolution: '90-metre horizontal grid cell',
  method: 'Bicubic spline interpolation from Copernicus GLO-90 / SRTM global raster tiles',
  crs: 'EPSG:4326 horizontal, EGM96 geoid vertical',
  units: {
    elevation: 'metres above sea level (m ASL)'
  },
  limitations: '90m macro elevation grid. Reflects bare-earth surface smoothed across the grid cell. Not a certified legal boundary survey or architectural finished-floor datum.',
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
        model: 'Copernicus DEM 90m / SRTM Blend',
        resolutionM: 90,
        metric
      },
      metrics: {
        terrain_elevation: metric
      }
    };
  }
}
