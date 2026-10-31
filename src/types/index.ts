/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Core Types
 */

export type MetricClassification = 
  | 'geometry-derived'
  | 'dataset-derived'
  | 'model-derived'
  | 'proxy'
  | 'unavailable';

export interface ProvenancedMetric<T = number | string | boolean | null> {
  id: string;
  name: string;
  label: string;
  value: T;
  formattedValue?: string;
  unit: string;
  classification: MetricClassification;
  source: string;
  calculationMethod: string;
  spatialResolution: string;
  timestampOrReferencePeriod: string;
  limitations: string;
  warning?: string;
  category?: 'geometry' | 'coordinates' | 'solar' | 'climate' | 'urban' | 'terrain';
}

export type FeatureType = 
  | 'site_boundary' 
  | 'transect' 
  | 'measure_line' 
  | 'datum_point';

export interface SiteFeatureProperties {
  id: string;
  name: string;
  featureType: FeatureType;
  color: string;
  strokeColor: string;
  fillOpacity: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  metrics: Record<string, ProvenancedMetric>;
  selfIntersecting?: boolean;
}

export interface SiteFeature {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Polygon' | 'LineString' | 'Point';
    coordinates: any;
  };
  properties: SiteFeatureProperties;
}

export interface SiteProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch?: number;
  bearing?: number;
  features: SiteFeature[];
  activeFeatureId: string | null;
  basemap: BasemapId;
  metadata: {
    client?: string;
    siteLocationName?: string;
    targetProgram?: string;
    version: string;
  };
}

export type BasemapId = 'liberty' | 'dark' | 'osm' | 'terrain';

export interface BasemapOption {
  id: BasemapId;
  name: string;
  attribution: string;
  styleUrl: string;
  description: string;
}

export interface CoordinateDMS {
  degrees: number;
  minutes: number;
  seconds: number;
  direction: 'N' | 'S' | 'E' | 'W';
  formatted: string;
}

export interface CoordinateReport {
  longitude: number;
  latitude: number;
  dmsLon: CoordinateDMS;
  dmsLat: CoordinateDMS;
  dmsFormatted: string;
  utm: {
    zone: number;
    hemisphere: 'N' | 'S';
    easting: number;
    northing: number;
    formatted: string;
    epsg: string;
  };
  webMercator: {
    x: number;
    y: number;
    formatted: string;
  };
}

export interface PolygonAnalysis {
  ellipsoidalAreaSqM: number;
  ellipsoidalAreaHectares: number;
  ellipsoidalAreaAcres: number;
  ellipsoidalPerimeterM: number;
  centroid: [number, number]; // [lng, lat]
  vertexCount: number;
  vertices: CoordinateReport[];
  bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
    eastWestSpanM: number;
    northSouthSpanM: number;
  };
  isSelfIntersecting: boolean;
  selfIntersectionPoints?: [number, number][];
  segments: {
    index: number;
    start: [number, number];
    end: [number, number];
    distanceM: number;
    initialAzimuthDeg: number;
    finalAzimuthDeg: number;
  }[];
  metrics: Record<string, ProvenancedMetric>;
}

export interface LineAnalysis {
  totalDistanceM: number;
  totalDistanceKm: number;
  initialBearingDeg: number;
  finalBearingDeg: number;
  segmentCount: number;
  segments: {
    index: number;
    start: [number, number];
    end: [number, number];
    distanceM: number;
    initialAzimuthDeg: number;
  }[];
  metrics: Record<string, ProvenancedMetric>;
}

export interface SolarAnalysis {
  timestamp: string;
  solarElevationDeg: number;
  solarAzimuthDeg: number;
  solarZenithDeg: number;
  sunriseTime: string;
  sunsetTime: string;
  solarNoonTime: string;
  daylightDurationHours: number;
  shadowLengthMultiplier: number; // Ratio of shadow length to height: 1 / tan(elevation)
  hourlySunPath: {
    hour: number;
    timeString: string;
    elevationDeg: number;
    azimuthDeg: number;
    isDaylight: boolean;
  }[];
  metrics: Record<string, ProvenancedMetric>;
}

export interface ClimateContextData {
  latitude: number;
  longitude: number;
  elevationM: number;
  temperatureC?: number;
  apparentTemperatureC?: number;
  relativeHumidityPct?: number;
  windSpeedKmh?: number;
  windDirectionDeg?: number;
  precipitationMm?: number;
  weatherCode?: number;
  weatherDescription?: string;
  isDay?: boolean;
  source: string;
  metrics: Record<string, ProvenancedMetric>;
  loadedAt: string;
}

export interface UrbanContextSummary {
  buildingCount: number;
  roadCount: number;
  amenityCount: number;
  landuseCount: number;
  sampledRadiusM: number;
  source: string;
  loadedAt: string;
  items: {
    category: string;
    name: string;
    type?: string;
    distanceM?: number;
  }[];
  metrics: Record<string, ProvenancedMetric>;
}
