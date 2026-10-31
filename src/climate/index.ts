/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Environmental & Climate Intelligence Module (M2.0)
 */

import { ClimateContextData, ProvenancedMetric } from '../types';
import { datasetRegistry, WeatherData, ElevationData, WMO_WEATHER_CODES } from '../data-providers';

export { WMO_WEATHER_CODES };

/**
 * Fetches real environmental and climate context for a geographic coordinate
 * Delegates to M2.0 DatasetRegistry, with independent verification for climate and elevation
 */
export async function fetchClimateContext(
  latitude: number,
  longitude: number,
  options?: { signal?: AbortSignal; bypassCache?: boolean }
): Promise<ClimateContextData> {
  try {
    // Parallel query for weather and independently verified elevation
    const [weatherDataset, elevationDataset] = await Promise.all([
      datasetRegistry.fetch<WeatherData>(
        'open-meteo-weather',
        { latitude, longitude },
        { signal: options?.signal, bypassCache: options?.bypassCache }
      ),
      datasetRegistry.fetch<ElevationData>(
        'elevation-dem',
        { latitude, longitude },
        { signal: options?.signal, bypassCache: options?.bypassCache }
      )
    ]);

    const isWeatherValid = (weatherDataset.status === 'success' || weatherDataset.status === 'partial') && weatherDataset.data;
    const isElevationValid = elevationDataset.status === 'success' && elevationDataset.data && elevationDataset.data.elevationM !== null;

    if (!isWeatherValid) {
      return {
        latitude,
        longitude,
        elevationM: isElevationValid ? elevationDataset.data!.elevationM : null,
        source: `${weatherDataset.metadata.source} (${weatherDataset.status})`,
        loadedAt: weatherDataset.metadata.retrievedAt,
        metrics: {
          climate_status: {
            id: 'climate-err',
            name: 'climate_status',
            label: 'Climate Service Status',
            value: weatherDataset.error?.message || 'Weather stream currently unavailable',
            formattedValue: weatherDataset.status === 'unavailable' ? 'Offline / Network Timeout' : 'Query Failed',
            unit: 'status',
            classification: 'unavailable',
            source: weatherDataset.metadata.source,
            calculationMethod: weatherDataset.metadata.method,
            spatialResolution: weatherDataset.metadata.spatialResolution,
            timestampOrReferencePeriod: weatherDataset.metadata.retrievedAt,
            limitations: weatherDataset.metadata.limitations,
            warning: 'Live meteorological context currently unavailable.',
            category: 'climate'
          },
          ...(isElevationValid && elevationDataset.data?.metric ? { terrain_elevation: elevationDataset.data.metric } : {})
        }
      };
    }

    const weather = weatherDataset.data!;
    const elevationVal = isElevationValid 
      ? elevationDataset.data!.elevationM 
      : (weather.elevationM !== null ? weather.elevationM : null);

    const metrics: Record<string, ProvenancedMetric> = {
      ...weather.metrics
    };

    if (isElevationValid && elevationDataset.data?.metric) {
      metrics.terrain_elevation = elevationDataset.data.metric;
    } else if (elevationVal !== null) {
      metrics.terrain_elevation = {
        id: 'climate-elevation',
        name: 'terrain_elevation',
        label: 'Surface Elevation (NWP Model Orography)',
        value: elevationVal,
        formattedValue: `${elevationVal.toFixed(1)} m ASL`,
        unit: 'm ASL',
        classification: 'dataset-derived',
        source: 'NWP Model Surface Elevation via Open-Meteo',
        calculationMethod: 'NWP surface model grid height interpolation',
        spatialResolution: weatherDataset.metadata.spatialResolution,
        timestampOrReferencePeriod: weatherDataset.metadata.timestampOrReferencePeriod,
        limitations: 'Coarse NWP grid elevation, not validated against high-resolution Copernicus DEM.',
        category: 'terrain'
      };
    } else {
      metrics.terrain_elevation = {
        id: 'climate-elevation',
        name: 'terrain_elevation',
        label: 'Surface Elevation',
        value: null,
        formattedValue: 'Unavailable (No DEM reference)',
        unit: 'm ASL',
        classification: 'unavailable',
        source: 'Copernicus DEM / Open-Meteo',
        calculationMethod: 'Raster DEM lookup',
        spatialResolution: 'N/A',
        timestampOrReferencePeriod: new Date().toISOString(),
        limitations: 'Surface elevation unavailable for this coordinate.',
        category: 'terrain'
      };
    }

    return {
      latitude: weather.latitude,
      longitude: weather.longitude,
      elevationM: elevationVal,
      temperatureC: weather.current.temperature2m ?? undefined,
      apparentTemperatureC: weather.current.apparentTemperature ?? undefined,
      relativeHumidityPct: weather.current.relativeHumidity2m ?? undefined,
      windSpeedKmh: weather.current.windSpeed10mKmh ?? undefined,
      windDirectionDeg: weather.current.windDirection10mDeg ?? undefined,
      precipitationMm: weather.current.precipitationMm ?? undefined,
      weatherCode: weather.current.weatherCode ?? undefined,
      weatherDescription: weather.current.weatherDescription,
      source: `${weatherDataset.metadata.source} (${weatherDataset.metadata.license.attributionStatement})`,
      loadedAt: weatherDataset.metadata.retrievedAt,
      metrics
    };
  } catch (err: any) {
    return {
      latitude,
      longitude,
      elevationM: null,
      source: 'Open-Meteo (Client Request Error)',
      loadedAt: new Date().toISOString(),
      metrics: {
        climate_status: {
          id: 'climate-err',
          name: 'climate_status',
          label: 'Climate Service Status',
          value: err.message || 'Client exception during weather query',
          formattedValue: 'Client Error',
          unit: 'status',
          classification: 'unavailable',
          source: 'Open-Meteo Provider',
          calculationMethod: 'REST API Request',
          spatialResolution: 'N/A',
          timestampOrReferencePeriod: new Date().toISOString(),
          limitations: 'Local client exception during query execution.',
          category: 'climate'
        }
      }
    };
  }
}
