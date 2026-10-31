/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Dataset Registry (M2.0.1)
 */

import { IDataProvider, SpatialDataset, SpatialQueryOptions } from './types';
import { BoundedLRUCache } from './cache';
import { OSMDataProvider } from './adapters/osm';
import { OpenMeteoWeatherProvider } from './adapters/open-meteo';
import { ElevationDataProvider } from './adapters/elevation';

interface InFlightEntry {
  promise: Promise<SpatialDataset>;
  underlyingAbortController: AbortController;
  subscribers: Set<symbol>;
}

export class DatasetRegistry {
  private static instance: DatasetRegistry;
  private readonly providers: Map<string, IDataProvider>;
  private readonly cache: BoundedLRUCache<SpatialDataset>;
  private readonly inFlightRequests: Map<string, InFlightEntry>;

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
   * Fetches data through the registered provider with automatic caching,
   * collision-resistant keying, request deduplication, and independent subscriber cancellation
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

    // Include both query and result-affecting options (siteBoundary, bbox, radiusMeters)
    const cacheKey = BoundedLRUCache.generateKey(
      providerId, 
      query as Record<string, any>, 
      options as Record<string, any>
    );

    // 1. Check cache unless bypassed
    if (!options.bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached as SpatialDataset<TData>;
      }
    }

    // 2. Setup subscriber tracking for independent cancellation
    const subscriberId = Symbol();
    let entry = this.inFlightRequests.get(cacheKey);

    if (!entry) {
      const underlyingAbortController = new AbortController();
      const subscribers = new Set<symbol>([subscriberId]);

      // Execute provider fetch with internal controller
      const promise = (async () => {
        try {
          const providerOptions: SpatialQueryOptions = {
            ...options,
            signal: underlyingAbortController.signal
          };
          const result = await provider.fetch(query, providerOptions);

          // Only cache successful, partial, or empty (valid negative) results; do not cache network failures or rate-limits
          if (result.status === 'success' || result.status === 'empty' || result.status === 'partial') {
            this.cache.set(cacheKey, result);
          }
          return result;
        } finally {
          this.inFlightRequests.delete(cacheKey);
        }
      })();

      entry = { promise, underlyingAbortController, subscribers };
      this.inFlightRequests.set(cacheKey, entry);
    } else {
      entry.subscribers.add(subscriberId);
    }

    const currentEntry = entry;

    // 3. Return promise wrapped with caller's independent AbortSignal listener
    const callerSignal = options.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        currentEntry.subscribers.delete(subscriberId);
        if (currentEntry.subscribers.size === 0) {
          currentEntry.underlyingAbortController.abort();
        }
        return {
          id: `${providerId}-aborted`,
          providerId,
          status: 'unavailable',
          metadata: provider.defaultMetadata,
          data: null,
          error: {
            code: 'ABORTED',
            message: 'Caller aborted request prior to execution.',
            retryable: false,
            timestamp: new Date().toISOString()
          }
        };
      }

      return new Promise<SpatialDataset<TData>>((resolve, reject) => {
        const onAbort = () => {
          callerSignal.removeEventListener('abort', onAbort);
          currentEntry.subscribers.delete(subscriberId);
          // Only abort underlying network request if NO other callers remain
          if (currentEntry.subscribers.size === 0) {
            currentEntry.underlyingAbortController.abort();
          }
          resolve({
            id: `${providerId}-aborted`,
            providerId,
            status: 'unavailable',
            metadata: provider.defaultMetadata,
            data: null,
            error: {
              code: 'ABORTED',
              message: 'Request was cancelled by caller.',
              retryable: false,
              timestamp: new Date().toISOString()
            }
          });
        };

        callerSignal.addEventListener('abort', onAbort, { once: true });

        currentEntry.promise
          .then(res => {
            callerSignal.removeEventListener('abort', onAbort);
            resolve(res as SpatialDataset<TData>);
          })
          .catch(err => {
            callerSignal.removeEventListener('abort', onAbort);
            reject(err);
          });
      });
    }

    return currentEntry.promise as Promise<SpatialDataset<TData>>;
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
