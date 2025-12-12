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
   * @returns A promise resolving to the API response with typed data
   */
  public static async post<T>(
    url: string,
    body: BodyInit,
    additionalHeaders?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const headers = { ...this.DEFAULT_HEADERS, ...additionalHeaders };
    return this.request<T>(url, 'POST', headers, body);
  }

  /**
   * Internal method to execute HTTP requests with error handling.
   * @param url - The endpoint URL to send the request to
   * @param method - The HTTP method to use
   * @param headers - Headers to include in the request
   * @param body - Optional request body
   * @returns A promise resolving to the API response with typed data
   */
  private static async request<T>(
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body?: BodyInit,
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
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
      console.error(`Error in API ${method} request to ${url}:`, error);
      return {
        success: false,
        error: {
          statusCode: HttpStatus.SERVER_ERROR,
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
    }
  }
}
