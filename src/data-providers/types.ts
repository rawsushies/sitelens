/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Data Provider Types (M2.0)
 */

import { ProvenancedMetric } from '../types';
import type { FeatureCollection } from 'geojson';

export type DatasetStatus = 
  | 'idle' 
  | 'loading' 
  | 'success' 
  | 'partial' 
  | 'empty' 
  | 'unavailable' 
  | 'error';

export interface DatasetLicense {
  id: string;
  name: string;
  url: string;
  attributionStatement: string;
  requiresAttribution: boolean;
  commercialUseAllowed: boolean;
}

export interface DatasetMetadata {
  id: string;
  title: string;
  description: string;
  source: string;
  sourceUrl?: string;
  license: DatasetLicense;
  attribution: string;
  timestampOrReferencePeriod: string;
  spatialResolution: string;
  method: string;
  crs: string; // e.g., 'EPSG:4326', 'WGS84'
  units: Record<string, string>;
  limitations: string;
  retrievedAt: string;
}

export interface DatasetError {
  code: 'NETWORK_ERROR' | 'TIMEOUT' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'PARSE_ERROR' | 'ABORTED' | 'UNAVAILABLE';
  message: string;
  statusCode?: number;
  retryable: boolean;
  timestamp: string;
}

export type BoundingBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

export interface SpatialQueryOptions {
  bbox?: BoundingBox;
  center?: [number, number]; // [lng, lat]
  radiusMeters?: number;
  siteBoundary?: [number, number][]; // Polygon ring for spatial containment filtering
  signal?: AbortSignal;
  timeoutMs?: number;
  bypassCache?: boolean;
}

export interface SpatialDataset<T = any> {
  id: string;
  providerId: string;
  status: DatasetStatus;
  metadata: DatasetMetadata;
  data: T | null;
  error?: DatasetError;
  featureCollection?: FeatureCollection;
  metrics?: Record<string, ProvenancedMetric>;
  stats?: {
    totalElements: number;
    retainedElements: number;
    isTruncated: boolean;
  };
}

export interface IDataProvider<TQuery = any, TData = any> {
  readonly id: string;
  readonly name: string;
  readonly defaultMetadata: DatasetMetadata;
  fetch(query: TQuery, options?: SpatialQueryOptions): Promise<SpatialDataset<TData>>;
}
