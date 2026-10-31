/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Coordinate Systems Module
 */

import proj4 from 'proj4';
import { CoordinateDMS, CoordinateReport, ProvenancedMetric } from '../types';

// Ensure standard projections are registered
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs');

/**
 * Calculates the standard UTM Zone number for a given longitude (-180 to 180)
 */
export function getUtmZone(longitude: number): number {
  return Math.floor((longitude + 180) / 6) + 1;
}

/**
 * Defines and returns proj4 projection string for a specific UTM zone and hemisphere
 */
export function getUtmProj4String(zone: number, hemisphere: 'N' | 'S'): string {
  const southFlag = hemisphere === 'S' ? '+south ' : '';
  return `+proj=utm +zone=${zone} ${southFlag}+datum=WGS84 +units=m +no_defs`;
}

/**
 * Converts decimal degrees to DMS structure
 */
export function decimalToDMS(deg: number, isLatitude: boolean): CoordinateDMS {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = Number(((minutesNotTruncated - minutes) * 60).toFixed(3));

  let direction: 'N' | 'S' | 'E' | 'W';
  if (isLatitude) {
    direction = deg >= 0 ? 'N' : 'S';
  } else {
    direction = deg >= 0 ? 'E' : 'W';
  }

  const formatted = `${degrees}° ${minutes}' ${seconds.toFixed(2)}" ${direction}`;
  return { degrees, minutes, seconds, direction, formatted };
}

/**
 * Generates a comprehensive coordinate report for a WGS84 [lng, lat] point
 */
export function inspectCoordinates(lng: number, lat: number): CoordinateReport {
  const dmsLon = decimalToDMS(lng, false);
  const dmsLat = decimalToDMS(lat, true);
  const dmsFormatted = `${dmsLat.formatted}, ${dmsLon.formatted}`;

  const zone = getUtmZone(lng);
  const hemisphere: 'N' | 'S' = lat >= 0 ? 'N' : 'S';
  const utmProjStr = getUtmProj4String(zone, hemisphere);

  // EPSG code for WGS84 UTM zones
  // Northern: 32601 - 32660
  // Southern: 32701 - 32760
  const epsgCode = hemisphere === 'N' ? `EPSG:${32600 + zone}` : `EPSG:${32700 + zone}`;

  // Project [lng, lat] from EPSG:4326 to UTM
  const [eastingRaw, northingRaw] = proj4('EPSG:4326', utmProjStr, [lng, lat]);
  const easting = Number(eastingRaw.toFixed(3));
  const northing = Number(northingRaw.toFixed(3));
  const utmFormatted = `${zone}${hemisphere} ${easting.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}m E, ${northing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}m N`;

  // Project [lng, lat] to Web Mercator (EPSG:3857) for visualization reference
  const [mercXRaw, mercYRaw] = proj4('EPSG:4326', 'EPSG:3857', [lng, lat]);
  const mercX = Number(mercXRaw.toFixed(2));
  const mercY = Number(mercYRaw.toFixed(2));
  const webMercatorFormatted = `X: ${mercX.toLocaleString('en-US')}m, Y: ${mercY.toLocaleString('en-US')}m (EPSG:3857)`;

  return {
    longitude: lng,
    latitude: lat,
    dmsLon,
    dmsLat,
    dmsFormatted,
    utm: {
      zone,
      hemisphere,
      easting,
      northing,
      formatted: utmFormatted,
      epsg: epsgCode,
    },
    webMercator: {
      x: mercX,
      y: mercY,
      formatted: webMercatorFormatted,
    },
  };
}

/**
 * Creates provenanced metrics for coordinate inspection
 */
export function getCoordinateMetrics(report: CoordinateReport): Record<string, ProvenancedMetric> {
  return {
    longitude_wgs84: {
      id: 'coord-lon',
      name: 'longitude',
      label: 'Longitude (WGS84)',
      value: report.longitude,
      formattedValue: `${report.longitude.toFixed(6)}°`,
      unit: '°',
      classification: 'geometry-derived',
      source: 'WGS84 Ellipsoid (EPSG:4326)',
      calculationMethod: 'Direct GNSS / Geographic Geodesic Coordinate',
      spatialResolution: 'Sub-millimetre floating point',
      timestampOrReferencePeriod: 'WGS84 Reference Epoch',
      limitations: 'Global unprojected angular coordinate; distances cannot be computed via Euclidean subtraction.',
      category: 'coordinates'
    },
    latitude_wgs84: {
      id: 'coord-lat',
      name: 'latitude',
      label: 'Latitude (WGS84)',
      value: report.latitude,
      formattedValue: `${report.latitude.toFixed(6)}°`,
      unit: '°',
      classification: 'geometry-derived',
      source: 'WGS84 Ellipsoid (EPSG:4326)',
      calculationMethod: 'Direct GNSS / Geographic Geodesic Coordinate',
      spatialResolution: 'Sub-millimetre floating point',
      timestampOrReferencePeriod: 'WGS84 Reference Epoch',
      limitations: 'Global unprojected angular coordinate; subject to meridional convergence towards poles.',
      category: 'coordinates'
    },
    utm_position: {
      id: 'coord-utm',
      name: 'utm_grid_reference',
      label: 'UTM Grid Coordinate',
      value: report.utm.formatted,
      formattedValue: report.utm.formatted,
      unit: 'UTM Grid (m)',
      classification: 'geometry-derived',
      source: `Proj4 Coordinate Transformation Engine (${report.utm.epsg})`,
      calculationMethod: 'Transverse Mercator projection onto WGS84 reference ellipsoid with central meridian scale factor 0.9996',
      spatialResolution: '1 mm numerical precision',
      timestampOrReferencePeriod: 'WGS84',
      limitations: `Conformal projection: scale distortion increases away from central meridian (+0.04% at zone boundaries). Zone: ${report.utm.zone}${report.utm.hemisphere}.`,
      category: 'coordinates'
    },
    dms_notation: {
      id: 'coord-dms',
      name: 'dms_notation',
      label: 'DMS Representation',
      value: report.dmsFormatted,
      formattedValue: report.dmsFormatted,
      unit: 'DMS',
      classification: 'geometry-derived',
      source: 'Sexagesimal Angular Deconstruction',
      calculationMethod: 'Floor division by 60 for minutes and seconds',
      spatialResolution: '0.01 arc-second (~0.3m on equator)',
      timestampOrReferencePeriod: 'WGS84',
      limitations: 'Standard architectural/survey notation; non-metric.',
      category: 'coordinates'
    }
  };
}

/**
 * Attempts to parse arbitrary user text inputs into [lng, lat] coordinates
 */
export function parseCoordinatesInput(text: string): [number, number] | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  // Pattern 1: Lat, Lng in decimal degrees (e.g. 51.5074, -0.1278 or 51.5074 -0.1278)
  const ddMatch = cleaned.match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
  if (ddMatch) {
    const v1 = parseFloat(ddMatch[1]);
    const v2 = parseFloat(ddMatch[2]);
    // Standard order in text input is often Lat, Lng
    if (Math.abs(v1) <= 90 && Math.abs(v2) <= 180) {
      return [v2, v1]; // [lng, lat]
    }
    // If v1 > 90 and v2 <= 90, user may have typed Lng, Lat
    if (Math.abs(v1) <= 180 && Math.abs(v2) <= 90) {
      return [v1, v2];
    }
  }

  // Pattern 2: DMS notation (e.g. 40° 42' 46" N, 74° 0' 21" W)
  const dmsRegex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)"?\s*([NSEWnsew])/g;
  const matches = [...cleaned.matchAll(dmsRegex)];
  if (matches.length === 2) {
    let lat: number | null = null;
    let lon: number | null = null;

    for (const m of matches) {
      const deg = parseFloat(m[1]);
      const min = parseFloat(m[2]);
      const sec = parseFloat(m[3]);
      const dir = m[4].toUpperCase();

      const dd = deg + min / 60 + sec / 3600;
      if (dir === 'N') lat = dd;
      else if (dir === 'S') lat = -dd;
      else if (dir === 'E') lon = dd;
      else if (dir === 'W') lon = -dd;
    }

    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return [lon, lat];
    }
  }

  return null;
}
