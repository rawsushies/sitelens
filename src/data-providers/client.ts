/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Resilient HTTP Client (M2.0)
 */

import { DatasetError } from './types';

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface ResilientFetchResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: DatasetError;
  headers: Headers;
}

/**
 * Executes a resilient HTTP fetch with timeout, cancellation, and exponential backoff
 */
export async function resilientFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<ResilientFetchResult<T>> {
  const {
    timeoutMs = 12000,
    retries = 2,
    initialDelayMs = 400,
    maxDelayMs = 2500,
    signal: externalSignal,
    ...fetchInit
  } = options;

  let attempt = 0;
  let lastError: DatasetError | undefined;

  while (attempt <= retries) {
    const controller = new AbortController();
    let timeoutTriggered = false;

    const timeoutTimer = setTimeout(() => {
      timeoutTriggered = true;
      controller.abort();
    }, timeoutMs);

    // Wire external signal
    const onExternalAbort = () => {
      controller.abort();
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutTimer);
        return {
          ok: false,
          status: 0,
          data: null,
          headers: new Headers(),
          error: {
            code: 'ABORTED',
            message: 'Request was cancelled by client.',
            retryable: false,
            timestamp: new Date().toISOString()
          }
        };
      }
      externalSignal.addEventListener('abort', onExternalAbort);
    }

    try {
      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal
      });

      clearTimeout(timeoutTimer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      // Check HTTP Status
      if (!response.ok) {
        const isRetryable = response.status === 429 || response.status >= 500;
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorBody = await response.text();
          if (errorBody && errorBody.length < 300) {
            errorMessage += ` - ${errorBody}`;
          }
        } catch {
          // Ignore body read failure
        }

        const categorizedError: DatasetError = {
          code: response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'SERVER_ERROR' : 'UNAVAILABLE',
          message: errorMessage,
          statusCode: response.status,
          retryable: isRetryable,
          timestamp: new Date().toISOString()
        };

        if (isRetryable && attempt < retries) {
          attempt++;
          const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 150, maxDelayMs);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        return {
          ok: false,
          status: response.status,
          data: null,
          headers: response.headers,
          error: categorizedError
        };
      }

      // Parse JSON body safely
      const contentType = response.headers.get('content-type') || '';
      let parsedData: any = null;
      if (contentType.includes('application/json')) {
        parsedData = await response.json();
      } else {
        const text = await response.text();
        try {
          parsedData = JSON.parse(text);
        } catch {
          parsedData = text;
        }
      }

      return {
        ok: true,
        status: response.status,
        data: parsedData,
        headers: response.headers
      };
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      const isAbortedByTimeout = timeoutTriggered;
      const isExternalAbort = externalSignal?.aborted;

      if (isExternalAbort) {
        return {
          ok: false,
          status: 0,
          data: null,
          headers: new Headers(),
          error: {
            code: 'ABORTED',
            message: 'Request aborted by caller.',
            retryable: false,
            timestamp: new Date().toISOString()
          }
        };
      }

      const errCode = isAbortedByTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
      const errMsg = isAbortedByTimeout 
        ? `Request timed out after ${timeoutMs}ms.` 
        : (err.message || 'Network connection failed.');

      lastError = {
        code: errCode,
        message: errMsg,
        retryable: !isExternalAbort,
        timestamp: new Date().toISOString()
      };

      if (attempt < retries) {
        attempt++;
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 150, maxDelayMs);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return {
        ok: false,
        status: 0,
        data: null,
        headers: new Headers(),
        error: lastError
      };
    }
  }

  return {
    ok: false,
    status: 0,
    data: null,
    headers: new Headers(),
    error: lastError || {
      code: 'UNAVAILABLE',
      message: 'Maximum retry limit exceeded.',
      retryable: false,
      timestamp: new Date().toISOString()
    }
  };
}
