import type { ApiResponse } from '@type/api';
import { HttpStatus } from '@type/api';

/**
 * HTTP method types for API requests.
 */
type HttpMethod = 'GET' | 'POST';

/**
 * Abstract utility class for making HTTP API requests with standardized error handling.
 */
export abstract class Api {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Default headers applied to all API requests.
   */
  private static readonly DEFAULT_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  /**
   * Makes a POST request to the specified URL.
   * @param url - The endpoint URL to send the request to
   * @param body - The request body to send
   * @param additionalHeaders - Optional headers to merge with default headers
   * @param timeoutMs - Optional request timeout; the request aborts when exceeded
   * @returns A promise resolving to the API response with typed data
   */
  public static async post<T>(
    url: string,
    body: BodyInit,
    additionalHeaders?: Record<string, string>,
    timeoutMs?: number,
  ): Promise<ApiResponse<T>> {
    const headers = { ...this.DEFAULT_HEADERS, ...additionalHeaders };
    return this.request<T>(url, 'POST', headers, body, timeoutMs);
  }

  /**
   * Internal method to execute HTTP requests with error handling.
   * @param url - The endpoint URL to send the request to
   * @param method - The HTTP method to use
   * @param headers - Headers to include in the request
   * @param body - Optional request body
   * @param timeoutMs - Optional request timeout; the request aborts when exceeded
   * @returns A promise resolving to the API response with typed data
   */
  private static async request<T>(
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body?: BodyInit,
    timeoutMs?: number,
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        ...(timeoutMs != null ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });

      if (!response.ok) {
        return {
          success: false,
          error: {
            statusCode: response.status as HttpStatus,
            message: `API Error: ${response.status} - ${response.statusText}`,
          },
        };
      }

      const data = await response.json() as T;
      return { success: true, data };
    } catch (error) {
      // Redact any query string before logging. For direct-key LLM
      // providers (e.g. Gemini) the API key is embedded as a `?key=...`
      // query parameter, which must never reach the console or any
      // log-collection tooling on the host page. Host + path are kept
      // for debuggability. The error message gets the same treatment:
      // some runtimes embed the full request URL in fetch failure text.
      const redactQuery = (text: string): string => text.replace(/\?\S*/g, '');
      const safeUrl = redactQuery(url);
      const rawMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const safeMessage = redactQuery(rawMessage);
      console.error(`Error in API ${method} request to ${safeUrl}: ${safeMessage}`);
      return {
        success: false,
        error: {
          statusCode: HttpStatus.SERVER_ERROR,
          message: safeMessage,
        },
      };
    }
  }
}
