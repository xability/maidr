/**
 * Generic API response wrapper containing success status, optional data, and error information.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

/**
 * API error information including message and HTTP status code.
 */
export interface ApiError {
  message: string;
  statusCode: HttpStatus;
}

/**
 * Standard HTTP status codes used in API responses.
 */
export enum HttpStatus {
  OK = 200,
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  SERVER_ERROR = 500,
}
