import type { DisplayService } from '@service/display';
import type { Maidr } from '@type/grammar';
import type { ClaudeVersion, GeminiVersion, GptVersion, Llm, LlmRequest, LlmResponse } from '@type/llm';
import type { PromptContext } from './prompts';
import type { TextService } from './text';
import { Scope } from '@type/event';
import { Api } from '@util/api';
import { Svg } from '@util/svg';
import { formatSystemPrompt, formatUserPrompt } from './prompts';

// Token limits for different LLM providers
const GPT_MAX_TOKENS = 1000;
const CLAUDE_MAX_TOKENS = 256;
const GEMINI_MAX_TOKENS = 1000;

/**
 * Service for managing chat interactions with different LLM providers.
 */
export class ChatService {
  private readonly display: DisplayService;
  private readonly textService: TextService;
  private readonly models: Record<Llm, LlmModel>;

  /**
   * Creates a new ChatService instance with configured LLM models.
   * @param {DisplayService} display - The display service for managing UI focus
   * @param {TextService} textService - The text service for retrieving coordinate text
   * @param {Maidr} maidr - The MAIDR data structure
   */
  public constructor(display: DisplayService, textService: TextService, maidr: Maidr) {
    this.display = display;
    this.textService = textService;

    this.models = {
      OPENAI: new Gpt(display.plot, maidr, textService, 'gpt-4o'),
      ANTHROPIC_CLAUDE: new Claude(display.plot, maidr, textService, 'claude-3-7-sonnet-latest'),
      GOOGLE_GEMINI: new Gemini(display.plot, maidr, textService, 'gemini-2.0-flash'),
    };
  }

  /**
   * Sends a message to the specified LLM model and returns the response.
   * @param {Llm} model - The LLM provider to use
   * @param {LlmRequest} request - The request containing the message and configuration
   * @returns {Promise<LlmResponse>} The response from the LLM
   */
  public async sendMessage(model: Llm, request: LlmRequest): Promise<LlmResponse> {
    return this.models[model].getLlmResponse(request);
  }

  /**
   * Toggles the focus to the chat scope.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.CHAT);
  }
}

/**
 * Interface for LLM model implementations.
 */
interface LlmModel {
  getLlmResponse: (request: LlmRequest) => Promise<LlmResponse>;
}

/**
 * Response structure from OpenAI GPT API.
 */
interface GptResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

/**
 * Response structure from Anthropic Claude API.
 */
interface ClaudeResponse {
  content: {
    text: string;
  }[];
}

/**
 * Response structure from Google Gemini API.
 */
interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
  }[];
}

/**
 * Abstract base class for LLM model implementations providing common functionality.
 * @template T - The response type specific to the LLM provider
 */
abstract class AbstractLlmModel<T> implements LlmModel {
  protected readonly svg: HTMLElement;
  protected readonly json: string;
  protected readonly textService: TextService;

  private readonly maidrBaseUrl: string;
  private readonly codeQueryParam: string;

  /**
   * Creates a new AbstractLlmModel instance.
   * @param {HTMLElement} svg - The SVG element representing the plot
   * @param {Maidr} maidr - The MAIDR data structure
   * @param {TextService} textService - The text service for retrieving coordinate text
   */
  protected constructor(svg: HTMLElement, maidr: Maidr, textService: TextService) {
    this.svg = svg;
    this.json = JSON.stringify(maidr);
    this.textService = textService;

    this.maidrBaseUrl = 'https://maidr-service.azurewebsites.net/api';
    this.codeQueryParam = 'I8Aa2PlPspjQ8Hks0QzGyszP8_i2-XJ3bq7Xh8-ykEe4AzFuYn_QWA%3D%3D';
  }

  /**
   * Sends a request to the LLM and returns the formatted response.
   * @param {LlmRequest} request - The request containing the message and configuration
   * @returns {Promise<LlmResponse>} The formatted response from the LLM
   */
  public async getLlmResponse(request: LlmRequest): Promise<LlmResponse> {
    try {
      const image = await Svg.toBase64(this.svg);
      // When expertise is 'custom', use 'advanced' as the base level since custom instructions will override
      const expertiseLevel = request.expertise === 'custom' ? 'advanced' : request.expertise;

      const currentPositionText = this.textService.getCoordinateText() || '';

      const payload = this.getPayload(
        request.customInstruction,
        this.json,
        image,
        currentPositionText,
        request.message,
        expertiseLevel,
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

  /**
   * Constructs the MAIDR service URL for LLM requests.
   * @returns {string} The complete MAIDR service URL
   */
  private getMaidrUrl(): string {
    return `${this.maidrBaseUrl}/${this.getEndPoint()}?code=${this.codeQueryParam}`;
  }

  /**
   * Builds HTTP headers for the LLM request with authentication.
   * @param {LlmRequest} request - The request containing authentication details
   * @returns {Record<string, string>} The HTTP headers
   */
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

  /**
   * Gets the API URL for the specific LLM provider.
   * @param {string} [apiKey] - The API key for authentication
   * @returns {string} The API URL
   */
  protected abstract getApiUrl(apiKey?: string): string;

  /**
   * Gets the endpoint name for MAIDR service routing.
   * @returns {string} The endpoint name
   */
  protected abstract getEndPoint(): string;

  /**
   * Constructs the request payload for the specific LLM provider.
   * @param {string} customInstruction - Custom instructions from the user
   * @param {string} maidrJson - The MAIDR data as JSON string
   * @param {string} image - The base64-encoded plot image
   * @param {string} currentText - The current position text
   * @param {string} message - The user's message
   * @param {'basic' | 'intermediate' | 'advanced'} expertise - The expertise level
   * @returns {string} The JSON payload
   */
  protected abstract getPayload(
    customInstruction: string,
    maidrJson: string,
    image: string,
    currentText: string,
    message: string,
    expertise: 'basic' | 'intermediate' | 'advanced',
  ): string;

  /**
   * Formats the provider-specific response into a standard LlmResponse.
   * @param {T} response - The raw response from the LLM provider
   * @returns {LlmResponse} The formatted response
   */
  protected abstract formatResponse(response: T): LlmResponse;
}

/**
 * OpenAI GPT model implementation.
 */
class Gpt extends AbstractLlmModel<GptResponse> {
  private readonly version: GptVersion;

  /**
   * Creates a new GPT model instance.
   * @param {HTMLElement} svg - The SVG element representing the plot
   * @param {Maidr} maidr - The MAIDR data structure
   * @param {TextService} textService - The text service for retrieving coordinate text
   * @param {GptVersion} version - The GPT model version to use
   */
  public constructor(svg: HTMLElement, maidr: Maidr, textService: TextService, version: GptVersion) {
    super(svg, maidr, textService);
    this.version = version;
  }

  /**
   * Gets the OpenAI API URL.
   * @returns {string} The OpenAI API URL
   */
  protected getApiUrl(): string {
    return 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * Gets the endpoint name for MAIDR service routing.
   * @returns {string} The endpoint name 'openai'
   */
  protected getEndPoint(): string {
    return 'openai';
  }

  /**
   * Constructs the GPT-specific request payload.
   * @param {string} customInstruction - Custom instructions from the user
   * @param {string} maidrJson - The MAIDR data as JSON string
   * @param {string} image - The base64-encoded plot image
   * @param {string} currentPositionText - The current position text
   * @param {string} message - The user's message
   * @param {'basic' | 'intermediate' | 'advanced'} expertise - The expertise level
   * @returns {string} The JSON payload for GPT API
   */
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
      max_tokens: GPT_MAX_TOKENS,
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

  /**
   * Formats the GPT response into a standard LlmResponse.
   * @param {GptResponse} response - The raw response from GPT API
   * @returns {LlmResponse} The formatted response
   */
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

  /**
   * Builds HTTP headers for GPT requests.
   * @param {LlmRequest} request - The request containing authentication details
   * @returns {Record<string, string>} The HTTP headers
   */
  protected getHeaders(request: LlmRequest): Record<string, string> {
    const headers = super.getHeaders(request);
    return headers;
  }
}

/**
 * Anthropic Claude model implementation.
 */
class Claude extends AbstractLlmModel<ClaudeResponse> {
  private readonly version: ClaudeVersion;

  /**
   * Creates a new Claude model instance.
   * @param {HTMLElement} svg - The SVG element representing the plot
   * @param {Maidr} maidr - The MAIDR data structure
   * @param {TextService} textService - The text service for retrieving coordinate text
   * @param {ClaudeVersion} version - The Claude model version to use
   */
  public constructor(svg: HTMLElement, maidr: Maidr, textService: TextService, version: ClaudeVersion) {
    super(svg, maidr, textService);
    this.version = version;
  }

  /**
   * Gets the Anthropic API URL.
   * @returns {string} The Anthropic API URL
   */
  protected getApiUrl(): string {
    return 'https://api.anthropic.com';
  }

  /**
   * Gets the endpoint name for MAIDR service routing.
   * @returns {string} The endpoint name 'claude'
   */
  protected getEndPoint(): string {
    return 'claude';
  }

  /**
   * Constructs the Claude-specific request payload.
   * @param {string} customInstruction - Custom instructions from the user
   * @param {string} maidrJson - The MAIDR data as JSON string
   * @param {string} image - The base64-encoded plot image
   * @param {string} currentPositionText - The current position text
   * @param {string} message - The user's message
   * @param {'basic' | 'intermediate' | 'advanced'} expertise - The expertise level
   * @returns {string} The JSON payload for Claude API
   */
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
      max_tokens: CLAUDE_MAX_TOKENS,
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

  /**
   * Formats the Claude response into a standard LlmResponse.
   * @param {ClaudeResponse} response - The raw response from Claude API
   * @returns {LlmResponse} The formatted response
   */
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

  /**
   * Builds HTTP headers for Claude requests including version header.
   * @param {LlmRequest} request - The request containing authentication details
   * @returns {Record<string, string>} The HTTP headers
   */
  protected getHeaders(request: LlmRequest): Record<string, string> {
    const headers = super.getHeaders(request);
    headers['anthropic-version'] = this.version;
    return headers;
  }
}

/**
 * Google Gemini model implementation.
 */
class Gemini extends AbstractLlmModel<GeminiResponse> {
  private readonly version: GeminiVersion;

  /**
   * Creates a new Gemini model instance.
   * @param {HTMLElement} svg - The SVG element representing the plot
   * @param {Maidr} maidr - The MAIDR data structure
   * @param {TextService} textService - The text service for retrieving coordinate text
   * @param {GeminiVersion} version - The Gemini model version to use
   */
  public constructor(svg: HTMLElement, maidr: Maidr, textService: TextService, version: GeminiVersion) {
    super(svg, maidr, textService);
    this.version = version;
  }

  /**
   * Gets the Google Gemini API URL with embedded API key.
   * @param {string} apiKey - The API key for authentication
   * @returns {string} The Gemini API URL
   * @throws {Error} If API key is not provided
   */
  protected getApiUrl(apiKey: string): string {
    if (!apiKey) {
      throw new Error('API key is required for Gemini API');
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.version}:generateContent?key=${apiKey}`;
  }

  /**
   * Gets the endpoint name for MAIDR service routing.
   * @returns {string} The endpoint name 'gemini'
   */
  protected getEndPoint(): string {
    return 'gemini';
  }

  /**
   * Constructs the Gemini-specific request payload.
   * @param {string} customInstruction - Custom instructions from the user
   * @param {string} maidrJson - The MAIDR data as JSON string
   * @param {string} image - The base64-encoded plot image
   * @param {string} currentPositionText - The current position text
   * @param {string} message - The user's message
   * @param {'basic' | 'intermediate' | 'advanced'} expertise - The expertise level
   * @returns {string} The JSON payload for Gemini API
   */
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

    const systemPrompt = formatSystemPrompt(customInstruction, context.expertiseLevel);
    const userPrompt = formatUserPrompt(context);
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const payload = JSON.stringify({
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_TOKENS,
      },
      safetySettings: [],
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: combinedPrompt,
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

    return payload;
  }

  /**
   * Formats the Gemini response into a standard LlmResponse.
   * @param {GeminiResponse} response - The raw response from Gemini API
   * @returns {LlmResponse} The formatted response
   */
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

  /**
   * Builds HTTP headers for Gemini requests, removing Authorization header as API key is in URL.
   * @param {LlmRequest} request - The request containing authentication details
   * @returns {Record<string, string>} The HTTP headers
   */
  protected getHeaders(request: LlmRequest): Record<string, string> {
    const headers = super.getHeaders(request);
    // Gemini uses API key in URL, so we don't need to add it to headers
    delete headers.Authorization;
    return headers;
  }
}
