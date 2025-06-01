import type { DisplayService } from '@service/display';
import type { Maidr } from '@type/grammar';
import type { ClaudeVersion, GeminiVersion, GptVersion, Llm, LlmRequest, LlmResponse } from '@type/llm';
import type { PromptContext } from './prompts';
import { Scope } from '@type/event';
import { Api } from '@util/api';
import { Svg } from '@util/svg';
import { formatSystemPrompt, formatUserPrompt } from './prompts';

export class ChatService {
  private readonly display: DisplayService;
  private readonly models: Record<Llm, LlmModel>;

  public constructor(display: DisplayService, maidr: Maidr) {
    this.display = display;

    this.models = {
      GPT: new Gpt(display.plot, maidr, 'gpt-4o'),
      CLAUDE: new Claude(display.plot, maidr, 'claude-3-7-sonnet-latest'),
      GEMINI: new Gemini(display.plot, maidr, 'gemini-2.0-flash'),
    };
  }

  public async sendMessage(model: Llm, request: LlmRequest): Promise<LlmResponse> {
    return this.models[model].getLlmResponse(request);
  }

  public toggle(): void {
    this.display.toggleFocus(Scope.CHAT);
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
        request.expertise,
      );

      const url = request.clientToken
        ? this.getMaidrUrl()
        : this.getApiUrl(request.apiKey);

      const headers = this.getHeaders(request);
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

  protected getHeaders(request: LlmRequest): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (request.clientToken) {
      headers.Authentication = `${request.email} ${request.clientToken}`;
    } else {
      headers.Authorization = `Bearer ${request.apiKey}`;
    }

    return headers;
  }

  protected abstract getApiUrl(apiKey?: string): string;

  protected abstract getEndPoint(): string;

  protected abstract getPayload(
    customInstruction: string,
    maidrJson: string,
    image: string,
    currentText: string,
    message: string,
    expertise: 'basic' | 'intermediate' | 'advanced',
  ): string;

  protected abstract formatResponse(response: T): LlmResponse;
}

class Gpt extends AbstractLlmModel<GptResponse> {
  private readonly version: GptVersion;

  public constructor(svg: HTMLElement, maidr: Maidr, version: GptVersion) {
    super(svg, maidr);
    this.version = version;
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
    expertise: 'basic' | 'intermediate' | 'advanced',
  ): string {
    const context: PromptContext = {
      customInstruction,
      maidrJson,
      currentPositionText,
      message,
      expertiseLevel: expertise,
    };

    return JSON.stringify({
      model: this.version,
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: formatSystemPrompt(customInstruction, context.expertiseLevel),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: formatUserPrompt(context),
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

  protected getHeaders(request: LlmRequest): Record<string, string> {
    const headers = super.getHeaders(request);
    return headers;
  }
}

class Claude extends AbstractLlmModel<ClaudeResponse> {
  private readonly version: ClaudeVersion;

  public constructor(svg: HTMLElement, maidr: Maidr, version: ClaudeVersion) {
    super(svg, maidr);
    this.version = version;
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
    expertise: 'basic' | 'intermediate' | 'advanced',
  ): string {
    const context: PromptContext = {
      customInstruction,
      maidrJson,
      currentPositionText,
      message,
      expertiseLevel: expertise,
    };

    return JSON.stringify({
      anthropic_version: this.version,
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
              text: `${formatSystemPrompt(customInstruction, context.expertiseLevel)}\n\n${formatUserPrompt(context)}`,
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

  protected getHeaders(request: LlmRequest): Record<string, string> {
    const headers = super.getHeaders(request);
    headers['anthropic-version'] = this.version;
    return headers;
  }
}

class Gemini extends AbstractLlmModel<GeminiResponse> {
  private readonly version: GeminiVersion;

  public constructor(svg: HTMLElement, maidr: Maidr, version: GeminiVersion) {
    super(svg, maidr);
    this.version = version;
  }

  protected getApiUrl(apiKey: string): string {
    if (!apiKey) {
      throw new Error('API key is required for Gemini API');
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.version}:generateContent?key=${apiKey}`;
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
    expertise: 'basic' | 'intermediate' | 'advanced',
  ): string {
    const context: PromptContext = {
      customInstruction,
      maidrJson,
      currentPositionText,
      message,
      expertiseLevel: expertise,
    };

    return JSON.stringify({
      generationConfig: {},
      safetySettings: [],
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: formatSystemPrompt(customInstruction, context.expertiseLevel),
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              text: formatUserPrompt(context),
            },
            {
              inlineData: {
                data: image.split(',')[1],
                mimeType: 'image/svg+xml',
              },
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

  protected getHeaders(request: LlmRequest): Record<string, string> {
    const headers = super.getHeaders(request);
    // Gemini uses API key in URL, so we don't need to add it to headers
    delete headers.Authorization;
    return headers;
  }
}
