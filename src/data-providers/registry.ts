/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Dataset Registry (M2.0)
 */

import { IDataProvider, SpatialDataset, SpatialQueryOptions } from './types';
import { BoundedLRUCache } from './cache';
import { OSMDataProvider } from './adapters/osm';
import { OpenMeteoWeatherProvider } from './adapters/open-meteo';
import { ElevationDataProvider } from './adapters/elevation';

export class DatasetRegistry {
  private static instance: DatasetRegistry;
  private readonly providers: Map<string, IDataProvider>;
  private readonly cache: BoundedLRUCache<SpatialDataset>;
  private readonly inFlightRequests: Map<string, Promise<SpatialDataset>>;

  private constructor() {
    this.providers = new Map();
    this.cache = new BoundedLRUCache(80, 15 * 60 * 1000); // 80 items, 15 min TTL
    this.inFlightRequests = new Map();

    // Register built-in providers
    this.registerProvider(new OSMDataProvider());
    this.registerProvider(new OpenMeteoWeatherProvider());
    this.registerProvider(new ElevationDataProvider());
  }

  public static getInstance(): DatasetRegistry {
    if (!DatasetRegistry.instance) {
      DatasetRegistry.instance = new DatasetRegistry();
    }
    return DatasetRegistry.instance;
  }

  public registerProvider(provider: IDataProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider<T = IDataProvider>(providerId: string): T | undefined {
    return this.providers.get(providerId) as T | undefined;
  }

  public getAllProviders(): IDataProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Fetches data through the registered provider with automatic caching, request deduplication, and lifecycle tracking
   */
  public async fetch<TData = any, TQuery = any>(
    providerId: string,
    query: TQuery,
    options: SpatialQueryOptions = {}
  ): Promise<SpatialDataset<TData>> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Data provider "${providerId}" is not registered in DatasetRegistry.`);
    }

    const cacheKey = BoundedLRUCache.generateKey(providerId, query as Record<string, any>);

    // 1. Check cache unless bypassed
    if (!options.bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as SpatialDataset<TData>;
      }
    }

    // 2. In-flight request deduplication
    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey) as Promise<SpatialDataset<TData>>;
    }

    // 3. Execute provider fetch
    const fetchPromise = (async () => {
      try {
        const result = await provider.fetch(query, options);
        // Only cache successful or empty (valid negative) results; do not cache network failures or rate-limits
        if (result.status === 'success' || result.status === 'empty' || result.status === 'partial') {
          this.cache.set(cacheKey, result);
        }
        return result;
      } finally {
        this.inFlightRequests.delete(cacheKey);
      }
    })();

    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  public getCache(): BoundedLRUCache<SpatialDataset> {
    return this.cache;
  }

  public invalidateProviderCache(providerId: string): number {
    return this.cache.invalidatePrefix(`${providerId}:`);
  }

  public clearAllCache(): void {
    this.cache.clear();
  }
}

export const datasetRegistry = DatasetRegistry.getInstance();
