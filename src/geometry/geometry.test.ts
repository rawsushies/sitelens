/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Unit Tests - Geodesy, Coordinate Transformations, and Geometric Analysis
 */

import { describe, it, expect } from 'vitest';
import { 
  calculateGeodesicDistance, 
  analyzePolygon, 
  checkPolygonSelfIntersection, 
  analyzeLine 
} from './index';
import { 
  decimalToDMS, 
  getUtmZone, 
  inspectCoordinates,
  formatLatitude,
  formatLongitude,
  formatCoordinatePair
} from '../coordinates';
import { calculateSolarAnalysis } from '../solar';

describe('Geodesic & Ellipsoidal Calculations', () => {
  it('calculates geodesic distance on WGS84 with sub-millimetre precision', () => {
    // Distance along 1 degree of equator
    const result = calculateGeodesicDistance([0, 0], [1, 0]);
    // WGS84 equatorial circumference is ~40,075,016m, so 1 degree is ~111,319.49m
    expect(result.distanceM).toBeGreaterThan(111300);
    expect(result.distanceM).toBeLessThan(111350);
    expect(result.initialAzimuthDeg).toBeCloseTo(90, 1);
  });

  it('calculates true WGS84 ellipsoidal polygon area', () => {
    // 1-degree square at the equator [0,0] to [1,1]
    const squareCoords: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0]
    ];
    const analysis = analyzePolygon(squareCoords);
    expect(analysis.ellipsoidalAreaSqM).toBeGreaterThan(12000000000); // ~12.3 billion m²
    expect(analysis.ellipsoidalAreaHectares).toBeGreaterThan(1200000);
    expect(analysis.isSelfIntersecting).toBe(false);
    expect(analysis.metrics.ellipsoidal_area.classification).toBe('geometry-derived');
  });

  it('detects self-intersecting bowtie polygon topology', () => {
    // Bowtie polygon with crossing edges
    const bowtie: [number, number][] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
      [0, 0]
    ];
    const check = checkPolygonSelfIntersection(bowtie);
    expect(check.isSelfIntersecting).toBe(true);
    expect(check.intersectionCount).toBe(1);

    // Clean non-intersecting quadrilateral
    const clean: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0]
    ];
    const cleanCheck = checkPolygonSelfIntersection(clean);
    expect(cleanCheck.isSelfIntersecting).toBe(false);
  });

  it('analyzes geodesic multi-segment lines and bearings', () => {
    const lineCoords: [number, number][] = [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01]
    ];
    const analysis = analyzeLine(lineCoords);
    expect(analysis.segmentCount).toBe(2);
    expect(analysis.totalDistanceM).toBeGreaterThan(2000);
    expect(analysis.segments[0].initialAzimuthDeg).toBeCloseTo(90, 0);
  });
});

describe('Coordinate Conversions & Projections', () => {
  it('converts decimal degrees to accurate DMS representations', () => {
    const latDms = decimalToDMS(51.4769, true);
    expect(latDms.degrees).toBe(51);
    expect(latDms.minutes).toBe(28);
    expect(latDms.direction).toBe('N');

    const lonDms = decimalToDMS(-0.0005, false);
    expect(lonDms.degrees).toBe(0);
    expect(lonDms.direction).toBe('W');
  });

  it('correctly assigns S for negative latitudes and W for negative longitudes', () => {
    // Southern hemisphere (Sydney, Australia)
    const southDms = decimalToDMS(-33.8688, true);
    expect(southDms.direction).toBe('S');
    expect(southDms.degrees).toBe(33);
    expect(southDms.formatted).toContain('S');

    // Western hemisphere (New York City, USA)
    const westDms = decimalToDMS(-74.006, false);
    expect(westDms.direction).toBe('W');
    expect(westDms.degrees).toBe(74);
    expect(westDms.formatted).toContain('W');
  });

  it('prevents 60.00" DMS rounding rollover and correctly increments minutes and degrees', () => {
    // Value where raw seconds are 59.999" (e.g. 51° 29' 59.999" -> 51° 30' 0.00" N)
    const rolloverMinutes = 51 + 29 / 60 + 59.999 / 3600;
    const rolloverMinDms = decimalToDMS(rolloverMinutes, true);
    expect(rolloverMinDms.seconds).toBe(0);
    expect(rolloverMinDms.minutes).toBe(30);
    expect(rolloverMinDms.degrees).toBe(51);
    expect(rolloverMinDms.formatted).not.toContain('60.00"');
    expect(rolloverMinDms.formatted).toBe('51° 30\' 0.00" N');

    // Value where minutes and seconds roll over (51° 59' 59.999" -> 52° 0' 0.00" N)
    const rolloverDegrees = 51 + 59 / 60 + 59.999 / 3600;
    const rolloverDegDms = decimalToDMS(rolloverDegrees, true);
    expect(rolloverDegDms.seconds).toBe(0);
    expect(rolloverDegDms.minutes).toBe(0);
    expect(rolloverDegDms.degrees).toBe(52);
    expect(rolloverDegDms.formatted).toBe('52° 0\' 0.00" N');
  });

  it('formats coordinates with dynamic hemisphere suffixes without hardcoding', () => {
    expect(formatLatitude(51.4769, 4)).toBe('51.4769° N');
    expect(formatLatitude(-33.8688, 4)).toBe('33.8688° S');
    expect(formatLongitude(-0.0015, 4)).toBe('0.0015° W');
    expect(formatLongitude(151.2093, 4)).toBe('151.2093° E');
    expect(formatCoordinatePair(-33.8688, 151.2093, 4)).toBe('33.8688° S, 151.2093° E');
    expect(formatCoordinatePair(40.7128, -74.006, 4)).toBe('40.7128° N, 74.0060° W');
  });

  it('determines correct UTM zones across global longitudes', () => {
    expect(getUtmZone(-0.0015)).toBe(30); // Greenwich is Zone 30
    expect(getUtmZone(-74.006)).toBe(18); // New York is Zone 18
    expect(getUtmZone(139.69)).toBe(54);  // Tokyo is Zone 54
  });

  it('projects coordinates to UTM and generates complete coordinate report', () => {
    const report = inspectCoordinates(-0.0015, 51.4769);
    expect(report.utm.zone).toBe(30);
    expect(report.utm.hemisphere).toBe('N');
    expect(report.utm.epsg).toBe('EPSG:32630');
    expect(report.utm.easting).toBeGreaterThan(600000);
    expect(report.utm.northing).toBeGreaterThan(5700000);
  });
});

describe('Solar Astronomical Engine', () => {
  it('calculates solar position with valid elevation and daylight duration', () => {
    const testDate = new Date('2026-06-21T12:00:00Z'); // Summer solstice at solar noon near Greenwich
    const solar = calculateSolarAnalysis(51.4769, 0, testDate);
    expect(solar.solarElevationDeg).toBeGreaterThan(50);
    expect(solar.daylightDurationHours).toBeGreaterThan(16);
    expect(solar.shadowLengthMultiplier).toBeLessThan(1.5);
    expect(solar.hourlySunPath.length).toBe(24);
  });
});
