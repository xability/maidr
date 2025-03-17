import type { DisplayService } from '@service/display';
import type { Llm, LlmRequest, LlmResponse } from '@type/llm';
import type { Maidr } from '@type/maidr';
import { Scope } from '@type/event';
import { Api } from '@util/api';
import { Svg } from '@util/svg';

export class ChatService {
  private readonly display: DisplayService;

  private readonly models: Record<Llm, LlmModel>;

  public constructor(display: DisplayService, maidr: Maidr) {
    this.display = display;

    this.models = {
      GPT: new Gpt(display.plot, maidr),
      CLAUDE: new Claude(display.plot, maidr),
      GEMINI: new Gemini(display.plot, maidr),
    };
  }

  public async sendMessage(model: Llm, request: LlmRequest): Promise<LlmResponse> {
    return this.models[model].getLlmResponse(request);
  }

  public toggle(oldState: boolean): boolean {
    this.display.toggleFocus(Scope.CHAT);
    return !oldState;
  }
}

interface LlmModel {
  getLlmResponse: (request: LlmRequest) => Promise<LlmResponse>;
}

interface GptResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

interface ClaudeResponse {
  content: {
    text: string;
  }[];
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
  }[];
}

abstract class AbstractLlmModel<T> implements LlmModel {
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
      const image = await Svg.toBase64(this.svg);
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

class Gpt extends AbstractLlmModel<GptResponse> {
  public constructor(svg: HTMLElement, maidr: Maidr) {
    super(svg, maidr);
  }

  protected getApiUrl(): string {
    return 'https://api.openai.com/v1/chat/completions';
  }

  protected getEndPoint(): string {
    return 'openai';
  }

  protected getPayload(
    customInstruction: string,
    maidrJson: string,
    image: string,
    currentPositionText: string,
    message: string,
  ): string {
    return JSON.stringify({
      model: 'gpt-4o-2024-11-20',
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant describing the chart to a blind person.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Describe this chart to a blind person who has a basic understanding of statistical charts.
                \n${customInstruction}\n
                Here is a chart in image format and raw data in json format: \n${maidrJson}\n
                Also currently this point is selected: ${currentPositionText}\n.
                My question is: ${message}`,
            },
            {
              type: 'image_url',
              image_url: {
                url: image,
              },
            },
          ],
        },
      ],
    });
  }

  protected formatResponse(response: GptResponse): LlmResponse {
    if (response.choices.length === 0) {
      return {
        success: false,
        error: 'Invalid response format',
      };
    }

    return {
      success: true,
      data: response.choices[0].message.content,
    };
  }
}

class Claude extends AbstractLlmModel<ClaudeResponse> {
  public constructor(svg: HTMLElement, maidr: Maidr) {
    super(svg, maidr);
  }

  protected getApiUrl(): string {
    return 'https://api.anthropic.com';
  }

  protected getEndPoint(): string {
    return 'claude';
  }

  protected getPayload(
    customInstruction: string,
    maidrJson: string,
    image: string,
    currentPositionText: string,
    message: string,
  ): string {
    return JSON.stringify({
      anthropic_version: 'vertex-2023-10-16',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text:
                `You are a helpful assistant describing the chart to a blind person.\n${customInstruction}\n.
                Here is the raw data in json format: ${maidrJson}\n\n\n
                Here is the current position in the chart; no response necessarily needed,
                use this info only if its relevant to future questions: ${currentPositionText}.
                My question is: ${message}`,
            },
          ],
        },
      ],
    });
  }

  protected formatResponse(response: ClaudeResponse): LlmResponse {
    if (response.content.length === 0) {
      return {
        success: false,
        error: 'Invalid response format',
      };
    }

    return {
      success: true,
      data: response.content[0].text,
    };
  }
}

class Gemini extends AbstractLlmModel<GeminiResponse> {
  public constructor(svg: HTMLElement, maidr: Maidr) {
    super(svg, maidr);
  }

  protected getApiUrl(apiKey?: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
  }

  protected getEndPoint(): string {
    return 'gemini';
  }

  protected getPayload(
    customInstruction: string,
    maidrJson: string,
    image: string,
    currentPositionText: string,
    message: string,
  ): string {
    return JSON.stringify({
      generationConfig: {},
      safetySettings: [],
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'You are a helpful assistant describing the chart to a blind person.',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              text:
                `You are a helpful assistant describing the chart to a blind person.\n${customInstruction}\n\n
                Describe this chart to a blind person who has a basic understanding of statistical charts.
                Here is a chart in image format and raw data in json format: ${maidrJson}`,
            },
            {
              inlineData: {
                data: image.split(',')[1],
                mimeType: 'image/svg+xml',
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              text:
                `Here is the current position in the chart; no response necessarily needed,
                use this info only if it's relevant to future questions: ${currentPositionText}\n.
                My question is: ${message}`,
            },
          ],
        },
      ],
    });
  }

  protected formatResponse(response: GeminiResponse): LlmResponse {
    if (response.candidates.length === 0) {
      return {
        success: false,
        error: 'Invalid response format',
      };
    }

    return {
      success: true,
      data: response.candidates[0].content.parts[0].text,
    };
  }
}
