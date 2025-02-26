import type { ApiResponse } from '@type/api';
import { HttpStatus } from '@type/api';

type HttpMethod = 'GET' | 'POST';

export abstract class Api {
  private constructor() { /* Prevent Instantiation */ }

  private static readonly MAIDR_URL: string = 'https://maidr-service.azurewebsites.net/api/';
  private static readonly SUFFIX: string = '?code=I8Aa2PlPspjQ8Hks0QzGyszP8_i2-XJ3bq7Xh8-ykEe4AzFuYn_QWA%3D%3D';
  private static readonly DEFAULT_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  public static async get<T>(
    endpoint: string,
    queryParams?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const queryString = queryParams ? `?${new URLSearchParams(queryParams).toString()}` : '';
    const url = `${endpoint}/${queryString}`;
    return this.request<T>(url, 'GET', this.DEFAULT_HEADERS);
  }

  public static async post<T>(
    url: string,
    body: BodyInit,
    additionalHeaders?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const headers = { ...this.DEFAULT_HEADERS, ...additionalHeaders };
    return this.request<T>(url, 'POST', headers, body);
  }

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

      const data = await response.json();
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
