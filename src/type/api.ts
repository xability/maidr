export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  message: string;
  statusCode: HttpStatus;
}

export enum HttpStatus {
  OK = 200,
  BAD_REQUEST = 400,
  SERVER_ERROR = 500,
}
