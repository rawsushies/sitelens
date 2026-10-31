/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Solar Astronomical Engine
 */

import { SolarAnalysis, ProvenancedMetric } from '../types';

/**
 * Calculates solar position and trajectory for a given location and timestamp
 * Based on NOAA Solar Calculator / Jean Meeus Astronomical Algorithms
 */
export function calculateSolarAnalysis(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): SolarAnalysis {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  // Day of year
  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000) + 1;

  // Fractional year (radians)
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (date.getUTCHours() - 12) / 24);

  // Equation of time (minutes)
  const eqtime = 229.18 * (
    0.000075 + 
    0.001868 * Math.cos(gamma) - 
    0.032077 * Math.sin(gamma) - 
    0.014615 * Math.cos(2 * gamma) - 
    0.040849 * Math.sin(2 * gamma)
  );

  // Solar declination angle (radians)
  const decl = 
    0.006918 - 
    0.399912 * Math.cos(gamma) + 
    0.070257 * Math.sin(gamma) - 
    0.006758 * Math.cos(2 * gamma) + 
    0.000907 * Math.sin(2 * gamma) - 
    0.002697 * Math.cos(3 * gamma) + 
    0.00148 * Math.sin(3 * gamma);

  // Time offset in minutes
  const timeOffset = eqtime + 4 * longitude - 60 * (date.getTimezoneOffset() / -60);

  // True solar time in minutes
  const localMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const tst = (localMinutes + timeOffset + 1440) % 1440;

  // Solar hour angle (degrees)
  let ha = tst / 4 - 180;
  if (ha < -180) ha += 360;

  // Solar zenith angle (radians)
  const latRad = latitude * rad;
  const cosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(ha * rad);
  const zenithRad = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const zenithDeg = zenithRad * deg;
  const elevationDeg = 90 - zenithDeg;

  // Solar azimuth angle (degrees clockwise from north)
  const cosAzimuth = (Math.sin(decl) - Math.sin(latRad) * Math.cos(zenithRad)) / (Math.cos(latRad) * Math.sin(zenithRad));
  let azimuthDeg = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * deg;
  if (ha > 0) {
    azimuthDeg = 360 - azimuthDeg;
  }

  // Sunrise and sunset calculations
  // Approximate hour angle for sunrise/sunset at zenith = 90.833° (standard refraction + disc radius)
  const cosHaSunrise = (Math.cos(90.833 * rad) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
  
  let sunriseStr = 'Polar Day/Night';
  let sunsetStr = 'Polar Day/Night';
  let daylightHours = 0;

  if (cosHaSunrise >= 1) {
    // Sun never rises (polar night)
    sunriseStr = 'None (Polar Night)';
    sunsetStr = 'None (Polar Night)';
    daylightHours = 0;
  } else if (cosHaSunrise <= -1) {
    // Sun never sets (midnight sun)
    sunriseStr = 'Continuous (Midnight Sun)';
    sunsetStr = 'Continuous (Midnight Sun)';
    daylightHours = 24;
  } else {
    const haSunriseDeg = Math.acos(cosHaSunrise) * deg;
    const sunriseMinutes = (720 - 4 * (longitude + haSunriseDeg) - eqtime + 1440) % 1440;
    const sunsetMinutes = (720 - 4 * (longitude - haSunriseDeg) - eqtime + 1440) % 1440;
    daylightHours = (haSunriseDeg * 2) / 15;

    const formatMinutes = (m: number) => {
      const h = Math.floor(m / 60) % 24;
      const min = Math.floor(m % 60);
      return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    };

    sunriseStr = formatMinutes(sunriseMinutes);
    sunsetStr = formatMinutes(sunsetMinutes);
  }

  // Solar noon
  const solarNoonMin = (720 - 4 * longitude - eqtime + 1440) % 1440;
  const solarNoonH = Math.floor(solarNoonMin / 60) % 24;
  const solarNoonM = Math.floor(solarNoonMin % 60);
  const solarNoonStr = `${solarNoonH.toString().padStart(2, '0')}:${solarNoonM.toString().padStart(2, '0')}`;

  // Shadow multiplier
  let shadowMultiplier = 999;
  if (elevationDeg > 0.5) {
    shadowMultiplier = Number((1 / Math.tan(elevationDeg * rad)).toFixed(2));
  }

  // Hourly sun path trajectory across 24 hours
  const hourlySunPath: SolarAnalysis['hourlySunPath'] = [];
  for (let h = 0; h < 24; h++) {
    const simDate = new Date(date);
    simDate.setHours(h, 0, 0, 0);
    const subLocalMin = h * 60;
    const subTst = (subLocalMin + timeOffset + 1440) % 1440;
    let subHa = subTst / 4 - 180;
    if (subHa < -180) subHa += 360;

    const subCosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(subHa * rad);
    const subZenithRad = Math.acos(Math.max(-1, Math.min(1, subCosZenith)));
    const subElev = 90 - subZenithRad * deg;

    const subCosAz = (Math.sin(decl) - Math.sin(latRad) * Math.cos(subZenithRad)) / (Math.cos(latRad) * Math.sin(subZenithRad));
    let subAz = Math.acos(Math.max(-1, Math.min(1, subCosAz))) * deg;
    if (subHa > 0) subAz = 360 - subAz;

    hourlySunPath.push({
      hour: h,
      timeString: `${h.toString().padStart(2, '0')}:00`,
      elevationDeg: Number(subElev.toFixed(1)),
      azimuthDeg: Number(subAz.toFixed(1)),
      isDaylight: subElev > 0,
    });
  }

  const metrics: Record<string, ProvenancedMetric> = {
    solar_elevation: {
      id: 'solar-elev',
      name: 'solar_elevation',
      label: 'Solar Altitude / Elevation',
      value: Number(elevationDeg.toFixed(2)),
      formattedValue: `${elevationDeg.toFixed(1)}° ${elevationDeg < 0 ? '(Below Horizon)' : ''}`,
      unit: '°',
      classification: 'model-derived',
      source: 'NOAA Solar Position Calculator / Jean Meeus Astronomical Formulae',
      calculationMethod: 'Analytical solar declination, equation of time, and local hour angle calculation',
      spatialResolution: 'Point coordinates exact',
      timestampOrReferencePeriod: date.toLocaleTimeString(),
      limitations: 'Neglects atmospheric refraction at elevations below 5°; assumes idealized spherical earth horizon.',
      category: 'solar'
    },
    solar_azimuth: {
      id: 'solar-azimuth',
      name: 'solar_azimuth',
      label: 'Solar Azimuth',
      value: Number(azimuthDeg.toFixed(2)),
      formattedValue: `${azimuthDeg.toFixed(1)}° (True North)`,
      unit: '°',
      classification: 'model-derived',
      source: 'NOAA Solar Position Algorithms',
      calculationMethod: 'Spherical trigonometry with declination, latitude, and zenith angle',
      spatialResolution: '0.1 degree',
      timestampOrReferencePeriod: date.toLocaleTimeString(),
      limitations: 'Calculated relative to True Geodetic North.',
      category: 'solar'
    },
    daylight_duration: {
      id: 'solar-daylight',
      name: 'daylight_duration',
      label: 'Daylight Duration',
      value: Number(daylightHours.toFixed(2)),
      formattedValue: `${daylightHours.toFixed(1)} hrs`,
      unit: 'hours',
      classification: 'model-derived',
      source: 'Astronomical Day-Length Formula',
      calculationMethod: 'Hour angle of civil sunrise to sunset with 0.833° atmospheric refraction allowance',
      spatialResolution: 'Latitudinal',
      timestampOrReferencePeriod: date.toISOString().split('T')[0],
      limitations: 'Does not account for terrain topography blocking horizon (mountainous ridgelines).',
      category: 'solar'
    },
    shadow_multiplier: {
      id: 'solar-shadow-ratio',
      name: 'shadow_length_ratio',
      label: 'Shadow Length Ratio',
      value: elevationDeg > 0 ? shadowMultiplier : null,
      formattedValue: elevationDeg > 0 ? `${shadowMultiplier}x height` : 'No direct sun (Night)',
      unit: 'multiplier',
      classification: 'model-derived',
      source: 'Geometric Trigonometry (1 / tan θ)',
      calculationMethod: 'Horizontal shadow projection ratio of vertical structure height',
      spatialResolution: 'Geometric',
      timestampOrReferencePeriod: date.toLocaleTimeString(),
      limitations: 'Valid for horizontal ground plane. Sloping terrain alters true shadow throw distance.',
      category: 'solar'
    }
  };

  return {
    timestamp: date.toISOString(),
    solarElevationDeg: Number(elevationDeg.toFixed(2)),
    solarAzimuthDeg: Number(azimuthDeg.toFixed(2)),
    solarZenithDeg: Number(zenithDeg.toFixed(2)),
    sunriseTime: sunriseStr,
    sunsetTime: sunsetStr,
    solarNoonTime: solarNoonStr,
    daylightDurationHours: Number(daylightHours.toFixed(2)),
    shadowLengthMultiplier: shadowMultiplier,
    hourlySunPath,
    metrics,
  };
}
