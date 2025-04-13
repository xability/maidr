import type { Llm, LlmRequest, LlmResponse } from '@type/llm';
import type { Maidr } from '@type/maidr';
import { Api } from '@util/api';

export class ChatService {
  private readonly maidr: Maidr;

  public constructor(maidr: Maidr) {
    this.maidr = maidr;
  }

  public async sendMessage(message: string, model: Llm, apiKey: string): Promise<LlmResponse> {
    const request: LlmRequest = {
      message,
      customInstruction: '',
      expertise: '',
      apiKey,
    };

    try {
      const response = await Api.post<LlmResponse>('/llm', JSON.stringify(request));
      if (!response.data) {
        return {
          success: false,
          error: 'No response data received',
        };
      }
      return response.data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}

interface LlmModel {
  getLlmResponse: (request: LlmRequest) => Promise<LlmResponse>;
}

abstract class _AbstractLlmModel<T> implements LlmModel {
  protected readonly svg: HTMLElement;
  protected readonly json: string;

  private readonly maidrBaseUrl: string;
  private readonly codeQueryParam: string;

  protected constructor(svg: HTMLElement, maidr: Maidr) {
    this.svg = svg;
    this.json = JSON.stringify(maidr);

    this.maidrBaseUrl = 'https://maidr-service.azurewebsites.net/api';
    this.codeQueryParam = 'I8Aa2PlPspjQ8Hks0QzGyszP8_i2-XJ3bq7Xh8-ykEe4AzFuYn_QWA%3D%3D';
  }

  public async getLlmResponse(request: LlmRequest): Promise<LlmResponse> {
    try {
      const image = await (this.svg as unknown as HTMLCanvasElement).toDataURL('image/svg+xml');
      const payload = this.getPayload(
        request.customInstruction,
        this.json,
        image,
        '',
        request.message,
      );

      const url = request.clientToken
        ? this.getMaidrUrl()
        : this.getApiUrl(request.apiKey);

      const headers: Record<string, string> = request.clientToken
        ? { Authentication: `${request.email} ${request.clientToken}` }
        : {};

      const response = await Api.post<T>(url, payload, headers);

      if (!response.success) {
        return {
          success: false,
          error: response.error?.message,
        };
      } else if (!response.data) {
        return {
          success: false,
          error: 'Response unavailable',
        };
      } else {
        return this.formatResponse(response.data);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private getMaidrUrl(): string {
    return `${this.maidrBaseUrl}/${this.getEndPoint()}?code=${this.codeQueryParam}`;
  }

  protected abstract getApiUrl(apiKey?: string): string;

  protected abstract getEndPoint(): string;

  protected abstract getPayload(
    customInstruction: string,
    maidrJson: string,
    image: string,
    currentText: string,
    message: string,
  ): string;

  protected abstract formatResponse(response: T): LlmResponse;
}
