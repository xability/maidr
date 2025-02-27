import type { ApiResponse } from '@type/api';
import { HttpStatus } from '@type/api';

type HttpMethod = 'GET' | 'POST';

export abstract class Api {
  private constructor() { /* Prevent Instantiation */ }

  private static readonly DEFAULT_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json',
  };

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
