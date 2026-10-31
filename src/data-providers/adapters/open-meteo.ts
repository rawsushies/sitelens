/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Open-Meteo Weather Provider (M2.0)
 */

import { IDataProvider, SpatialDataset, SpatialQueryOptions, DatasetMetadata, DatasetStatus } from '../types';
import { resilientFetch } from '../client';
import { ProvenancedMetric } from '../../types';

export interface WeatherQuery {
  latitude: number;
  longitude: number;
}

export interface WeatherData {
  latitude: number;
  longitude: number;
  elevationM: number | null;
  utcOffsetSeconds: number;
  timezone: string;
  generationTimeMs: number;
  current: {
    time: string;
    interval: number;
    temperature2m: number | null;
    relativeHumidity2m: number | null;
    apparentTemperature: number | null;
    precipitationMm: number | null;
    weatherCode: number | null;
    weatherDescription: string;
    windSpeed10mKmh: number | null;
    windDirection10mDeg: number | null;
  };
  metrics: Record<string, ProvenancedMetric>;
}

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
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

function getCardinalDirection(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((deg % 360) / 22.5)) % 16;
  return directions[index];
}

const WEATHER_METADATA: DatasetMetadata = {
  id: 'open-meteo-nwp',
  title: 'Open-Meteo Global Numerical Weather Prediction (NWP) Model',
  description: 'Synoptic atmospheric observation and NWP model blend providing near-surface meteorological indicators.',
  source: 'Open-Meteo Open Weather Forecast API',
  sourceUrl: 'https://open-meteo.com',
  license: {
    id: 'CC-BY-4.0',
    name: 'Creative Commons Attribution 4.0 International',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    attributionStatement: 'Weather data by Open-Meteo.com',
    requiresAttribution: true,
    commercialUseAllowed: true,
  },
  attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
  timestampOrReferencePeriod: 'Current NWP Run & Near-Surface Interpolation',
  spatialResolution: 'Variable NWP grid resolution (~1.5 km to ~11 km globally; specific sub-model is unversioned in default Open-Meteo endpoint)',
  method: 'Bilinear spatial interpolation from closest NWP grid points with pressure-height reduction',
  crs: 'EPSG:4326',
  units: {
    temperature: '°C',
    humidity: '%',
    windSpeed: 'km/h',
    windDirection: 'degrees clockwise from true north',
    precipitation: 'mm'
  },
  limitations: 'Regional atmospheric model data. Open-Meteo blends multiple national weather service models (ECMWF, DWD, NOAA, Météo-France) without per-point sub-model attribution in the default endpoint. Does not resolve building microclimate, street canyon wind eddies, or micro-scale urban heat islands.',
  retrievedAt: new Date().toISOString()
};

export class OpenMeteoWeatherProvider implements IDataProvider<WeatherQuery, WeatherData> {
  readonly id = 'open-meteo-weather';
  readonly name = 'Open-Meteo NWP Weather Provider';
  readonly defaultMetadata = WEATHER_METADATA;

  async fetch(query: WeatherQuery, options: SpatialQueryOptions = {}): Promise<SpatialDataset<WeatherData>> {
    const lat = query.latitude;
    const lng = query.longitude;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;

    const res = await resilientFetch(url, {
      method: 'GET',
      timeoutMs: options.timeoutMs || 10000,
      retries: 2,
      signal: options.signal
    });

    const metadata: DatasetMetadata = {
      ...this.defaultMetadata,
      retrievedAt: new Date().toISOString()
    };

    if (!res.ok || !res.data) {
      const isUnavailable = res.status === 429 || res.status >= 500 || res.status === 0;
      return {
        id: `weather-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        providerId: this.id,
        status: isUnavailable ? 'unavailable' : 'error',
        metadata,
        data: null,
        error: res.error || {
          code: 'UNAVAILABLE',
          message: 'Weather service request failed.',
          retryable: true,
          timestamp: new Date().toISOString()
        }
      };
    }

    const payload = res.data;
    const current = payload.current || {};
    const elevation = typeof payload.elevation === 'number' ? payload.elevation : null;
    const weatherDesc = typeof current.weather_code === 'number' && WMO_WEATHER_CODES[current.weather_code] 
      ? WMO_WEATHER_CODES[current.weather_code] 
      : 'Atmospheric observation';

    // Authoritative model provenance without geographic region inference heuristics
    const verifiedModelSource = 'Open-Meteo Best-Match Global NWP Ensemble';
    const verifiedResolution = 'Variable NWP grid resolution (~1.5 km to ~11 km globally; specific sub-model unversioned in default endpoint)';

    const metrics: Record<string, ProvenancedMetric> = {
      ambient_temperature: {
        id: 'climate-temp',
        name: 'ambient_temperature',
        label: 'Ambient Air Temperature (2m AGL)',
        value: current.temperature_2m ?? null,
        formattedValue: current.temperature_2m !== undefined && current.temperature_2m !== null ? `${current.temperature_2m.toFixed(1)} °C` : 'Unavailable',
        unit: '°C',
        classification: 'dataset-derived',
        source: verifiedModelSource,
        calculationMethod: 'Bilinear spatial interpolation from numerical weather prediction grid cell',
        spatialResolution: verifiedResolution,
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Regional atmospheric model data. Does not reflect parcel microclimate, building thermal mass, or direct solar heating on facades.',
        category: 'climate'
      },
      apparent_temperature: {
        id: 'climate-feels-like',
        name: 'apparent_temperature',
        label: 'Apparent "Feels Like" Temperature',
        value: current.apparent_temperature ?? null,
        formattedValue: current.apparent_temperature !== undefined && current.apparent_temperature !== null ? `${current.apparent_temperature.toFixed(1)} °C` : 'Unavailable',
        unit: '°C',
        classification: 'dataset-derived',
        source: verifiedModelSource,
        calculationMethod: 'Australian BOM Apparent Temperature empirical model (combines dry bulb temp, vapor pressure, and 10m wind)',
        spatialResolution: verifiedResolution,
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Bioclimatic comfort index for standard shaded outdoor human body thermal balance.',
        category: 'climate'
      },
      relative_humidity: {
        id: 'climate-humidity',
        name: 'relative_humidity',
        label: 'Relative Humidity (2m)',
        value: current.relative_humidity_2m ?? null,
        formattedValue: current.relative_humidity_2m !== undefined && current.relative_humidity_2m !== null ? `${current.relative_humidity_2m}%` : 'Unavailable',
        unit: '%',
        classification: 'dataset-derived',
        source: verifiedModelSource,
        calculationMethod: 'Ratio of partial pressure of water vapor to saturation vapor pressure',
        spatialResolution: verifiedResolution,
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Regional atmospheric humidity. Dense site vegetation or water features may locally increase moisture.',
        category: 'climate'
      },
      wind_speed: {
        id: 'climate-wind-speed',
        name: 'wind_speed',
        label: 'Synoptic Wind Speed (10m AGL)',
        value: current.wind_speed_10m ?? null,
        formattedValue: current.wind_speed_10m !== undefined && current.wind_speed_10m !== null ? `${current.wind_speed_10m.toFixed(1)} km/h` : 'Unavailable',
        unit: 'km/h',
        classification: 'dataset-derived',
        source: verifiedModelSource,
        calculationMethod: 'NWP horizontal velocity vector at 10 metres above standard roughness length ground level',
        spatialResolution: verifiedResolution,
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Open terrain reference height. Surrounding buildings, trees, and topographic barriers will cause local redirection and shielding.',
        category: 'climate'
      },
      wind_direction: {
        id: 'climate-wind-dir',
        name: 'wind_direction',
        label: 'Synoptic Wind Direction (10m)',
        value: current.wind_direction_10m ?? null,
        formattedValue: current.wind_direction_10m !== undefined && current.wind_direction_10m !== null ? `${current.wind_direction_10m}° (${getCardinalDirection(current.wind_direction_10m)})` : 'Unavailable',
        unit: '°',
        classification: 'dataset-derived',
        source: verifiedModelSource,
        calculationMethod: 'Direction from which wind originates, measured clockwise from True North (0° = North)',
        spatialResolution: verifiedResolution,
        timestampOrReferencePeriod: current.time || new Date().toISOString(),
        limitations: 'Synoptic regional flow direction. Complex urban canyons cause localized wake and recirculation vortices.',
        category: 'climate'
      }
    };

    return {
      id: `weather-${lat.toFixed(4)}-${lng.toFixed(4)}`,
      providerId: this.id,
      status: 'success',
      metadata: {
        ...metadata,
        spatialResolution: verifiedResolution,
        source: verifiedModelSource
      },
      data: {
        latitude: payload.latitude || lat,
        longitude: payload.longitude || lng,
        elevationM: elevation,
        utcOffsetSeconds: payload.utc_offset_seconds || 0,
        timezone: payload.timezone || 'UTC',
        generationTimeMs: payload.generationtime_ms || 0,
        current: {
          time: current.time || new Date().toISOString(),
          interval: current.interval || 900,
          temperature2m: current.temperature_2m ?? null,
          relativeHumidity2m: current.relative_humidity_2m ?? null,
          apparentTemperature: current.apparent_temperature ?? null,
          precipitationMm: current.precipitation ?? null,
          weatherCode: current.weather_code ?? null,
          weatherDescription: weatherDesc,
          windSpeed10mKmh: current.wind_speed_10m ?? null,
          windDirection10mDeg: current.wind_direction_10m ?? null
        },
        metrics
      },
      metrics
    };
  }
}
