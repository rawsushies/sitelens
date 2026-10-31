/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Environmental & Climate Intelligence Module
 */

import { ClimateContextData, ProvenancedMetric } from '../types';

export const WMO_WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

/**
 * Fetches real environmental and climate context for a geographic coordinate
 * Source: Open-Meteo Global Numerical Weather Prediction (NWP) model
 */
export async function fetchClimateContext(
  latitude: number,
  longitude: number
): Promise<ClimateContextData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const current = data.current || {};
    const elevation = data.elevation || 0;

    const weatherDesc = WMO_WEATHER_CODES[current.weather_code] || 'Atmospheric observation';

    const metrics: Record<string, ProvenancedMetric> = {
      ambient_temperature: {
        id: 'climate-temp',
        name: 'ambient_temperature',
        label: 'Ambient Air Temperature (2m AGL)',
        value: current.temperature_2m ?? null,
        formattedValue: current.temperature_2m !== undefined ? `${current.temperature_2m.toFixed(1)} °C` : 'Unavailable',
        unit: '°C',
        classification: 'dataset-derived',
        source: 'Open-Meteo Open Weather API / ECMWF IFS / GFS Model Blend',
        calculationMethod: 'Bilinear spatial interpolation from 0.1° numerical weather prediction grid cell',
        spatialResolution: '11 km NWP grid cell',
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Regional atmospheric model data. Does not reflect parcel-level microclimate, thermal mass of adjacent structures, or urban heat island street-canyon effects.',
        category: 'climate'
      },
      apparent_temperature: {
        id: 'climate-feels-like',
        name: 'apparent_temperature',
        label: 'Apparent "Feels Like" Temperature',
        value: current.apparent_temperature ?? null,
        formattedValue: current.apparent_temperature !== undefined ? `${current.apparent_temperature.toFixed(1)} °C` : 'Unavailable',
        unit: '°C',
        classification: 'dataset-derived',
        source: 'Open-Meteo NWP Ensemble',
        calculationMethod: 'Australian Bureau of Meteorology Apparent Temperature Formula (considers wind speed and humidity)',
        spatialResolution: '11 km NWP grid cell',
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Bioclimatic comfort index for standard clothing insulation in shaded conditions.',
        category: 'climate'
      },
      relative_humidity: {
        id: 'climate-humidity',
        name: 'relative_humidity',
        label: 'Relative Humidity (2m)',
        value: current.relative_humidity_2m ?? null,
        formattedValue: current.relative_humidity_2m !== undefined ? `${current.relative_humidity_2m}%` : 'Unavailable',
        unit: '%',
        classification: 'dataset-derived',
        source: 'Open-Meteo NWP Model Blend',
        calculationMethod: 'Ratio of partial pressure of water vapor to equilibrium vapor pressure',
        spatialResolution: '11 km NWP grid cell',
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Regional atmospheric moisture. Ground-level vegetation or water bodies may raise local parcel humidity.',
        category: 'climate'
      },
      wind_speed_10m: {
        id: 'climate-wind-speed',
        name: 'wind_speed_10m',
        label: 'Wind Speed (10m AGL)',
        value: current.wind_speed_10m ?? null,
        formattedValue: current.wind_speed_10m !== undefined ? `${current.wind_speed_10m.toFixed(1)} km/h` : 'Unavailable',
        unit: 'km/h',
        classification: 'dataset-derived',
        source: 'Open-Meteo NWP Grid',
        calculationMethod: 'Standard aerodynamic boundary layer prediction at 10 metres above open terrain',
        spatialResolution: '11 km NWP grid cell',
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Unobstructed 10m wind speed. Building geometry, street orientation, and vegetation cause significant localized wind channelling or sheltering.',
        category: 'climate'
      },
      wind_direction_10m: {
        id: 'climate-wind-dir',
        name: 'wind_direction_10m',
        label: 'Wind Direction (10m AGL)',
        value: current.wind_direction_10m ?? null,
        formattedValue: current.wind_direction_10m !== undefined ? `${current.wind_direction_10m}° (${getCardinalDirection(current.wind_direction_10m)})` : 'Unavailable',
        unit: '°',
        classification: 'dataset-derived',
        source: 'Open-Meteo NWP Grid',
        calculationMethod: 'Direction from which wind originates, measured clockwise from True North',
        spatialResolution: '11 km NWP grid cell',
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Regional synoptic flow direction. Does not include street canyon eddies or terrain deflection.',
        category: 'climate'
      },
      elevation_dem: {
        id: 'climate-elevation',
        name: 'terrain_elevation',
        label: 'Estimated Surface Elevation',
        value: elevation,
        formattedValue: `${elevation.toFixed(1)} m ASL`,
        unit: 'm ASL',
        classification: 'dataset-derived',
        source: 'Copernicus DEM 90m / SRTM via Open-Meteo',
        calculationMethod: 'Digital Elevation Model raster grid interpolation',
        spatialResolution: '90 metre raster cell',
        timestampOrReferencePeriod: 'Copernicus DEM Reference',
        limitations: '90m macro elevation grid. Not suitable as a legal survey datum or high-precision architectural finished floor reference.',
        category: 'terrain'
      }
    };

    return {
      latitude,
      longitude,
      elevationM: elevation,
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      relativeHumidityPct: current.relative_humidity_2m,
      windSpeedKmh: current.wind_speed_10m,
      windDirectionDeg: current.wind_direction_10m,
      precipitationMm: current.precipitation,
      weatherCode: current.weather_code,
      weatherDescription: weatherDesc,
      source: 'Open-Meteo (Non-commercial Open Weather Service)',
      loadedAt: new Date().toISOString(),
      metrics,
    };
  } catch (err: any) {
    return {
      latitude,
      longitude,
      elevationM: 0,
      source: 'Open-Meteo (Fetch Failed)',
      loadedAt: new Date().toISOString(),
      metrics: {
        climate_status: {
          id: 'climate-err',
          name: 'climate_status',
          label: 'Climate Service Status',
          value: 'Failed to fetch external weather stream',
          formattedValue: 'Offline / Network Timeout',
          unit: 'status',
          classification: 'unavailable',
          source: 'Open-Meteo',
          calculationMethod: 'REST API Request',
          spatialResolution: 'N/A',
          timestampOrReferencePeriod: new Date().toISOString(),
          limitations: 'Network connection or remote server rate limit prevented fetching weather data.',
          warning: 'Live weather context currently unavailable.',
          category: 'climate'
        }
      }
    };
  }
}

function getCardinalDirection(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((deg % 360) / 22.5)) % 16;
  return directions[index];
}
