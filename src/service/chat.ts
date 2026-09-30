import type { DisplayService } from '@service/display';
import type { ApiResponse } from '@type/api';
import type { Maidr } from '@type/grammar';
import type { ChatSnapshot, ChatTurn, ClaudeVersion, GeminiVersion, GptVersion, Llm, LlmRequest, LlmResponse, LlmVersion, OllamaVersion } from '@type/llm';
import type { PromptContext } from './prompts';
import type { TextService } from './text';
import { HttpStatus } from '@type/api';
import { Scope } from '@type/event';
import { ANTHROPIC_API_VERSION } from '@type/llm';
import { Api } from '@util/api';
import { t } from '@util/i18n';
import { isValidOllamaBaseUrl, normalizeOllamaBaseUrl } from '@util/llm';
import { Svg } from '@util/svg';
import { MODEL_VERSIONS } from './modelVersions';
import { formatDataPrompt, formatSystemPrompt, formatUserPrompt } from './prompts';

// Token limits for different LLM providers. The cloud limits cover reasoning
// as well as the answer: GPT-5/6, Claude Opus 5 and later, and Gemini 3 think
// by default and bill that thinking against these same caps, so a ~1000-token
// cap left them with nothing for the answer. Answer length is set by the
// prompt, not by these caps.
const GPT_MAX_TOKENS = 8192;
const CLAUDE_MAX_TOKENS = 8192;
const GEMINI_MAX_TOKENS = 8192;
// Maps to Ollama's num_predict, which caps generated tokens only (it is not
// the context window).
const OLLAMA_MAX_TOKENS = 1000;

// Earlier exchanges sent along with a question. Each is a few lines of text, so
// this bounds the request rather than the cost of a turn; the oldest go first.
const MAX_HISTORY_TURNS = 10;

// Generous cap for the chat request itself: large local models and
// deep-reasoning cloud models can legitimately take a while, but a hung
// provider must not stall the chat (and its waiting tone) forever.
const LLM_REQUEST_TIMEOUT_MS = 120000;

/**
 * Service for managing chat interactions with different LLM providers.
 */
export class ChatService {
  private readonly display: DisplayService;
  private readonly textService: TextService;
  private readonly models: Record<Llm, LlmModel>;

  // In-flight LLM request controllers, aborted by dispose() so a slow or hung
  // provider cannot keep a request continuation (and its waiting tone) alive
  // after the plot loses focus and the Controller is disposed.
  private readonly pendingRequests: Set<AbortController>;

  // Mutable: replaced on live data updates; serialized lazily so
  // high-frequency streaming never pays for JSON.stringify.
  private data: Maidr;
  private cachedJson: string | null;

  // When the chart data last changed. An answer given about the old data says
  // nothing about the new, so earlier exchanges are not carried across it.
  private dataChangedAt: number;

  /**
   * Creates a new ChatService instance with configured LLM models.
   * @param {DisplayService} display - The display service for managing UI focus
   * @param {TextService} textService - The text service for retrieving coordinate text
   * @param {Maidr} maidr - The MAIDR data structure
   */
  public constructor(display: DisplayService, textService: TextService, maidr: Maidr) {
    this.display = display;
    this.textService = textService;
    this.pendingRequests = new Set();
    this.data = maidr;
    this.cachedJson = null;
    this.dataChangedAt = 0;

    // Construction-time versions are fallbacks only; the user-selected
    // version arrives per request via LlmRequest.version. What the model is
    // grounded on arrives with the request too, as a snapshot.
    this.models = {
      OPENAI: new Gpt(MODEL_VERSIONS.OPENAI.default),
      ANTHROPIC_CLAUDE: new Claude(MODEL_VERSIONS.ANTHROPIC_CLAUDE.default),
      GOOGLE_GEMINI: new Gemini(MODEL_VERSIONS.GOOGLE_GEMINI.default),
      OLLAMA: new Ollama(MODEL_VERSIONS.OLLAMA.default),
    };
  }

  /**
   * Sends a message to the specified LLM model and returns the response.
   * @param {Llm} model - The LLM provider to use
   * @param {LlmRequest} request - The request containing the message and configuration
   * @returns {Promise<LlmResponse>} The response from the LLM
   */
  public async sendMessage(model: Llm, request: LlmRequest): Promise<LlmResponse> {
    const controller = new AbortController();
    this.pendingRequests.add(controller);
    try {
      const snapshot = request.snapshot ?? this.captureSnapshot();
      const history = (request.history ?? [])
        .filter(turn => Date.parse(turn.timestamp) >= this.dataChangedAt)
        .slice(-MAX_HISTORY_TURNS);
      return await this.models[model].getLlmResponse({ ...request, history }, snapshot, controller.signal);
    } finally {
      this.pendingRequests.delete(controller);
    }
  }

  /**
   * Returns the serialized chart data shared with all LLM providers,
   * serializing on first use after a data change and caching thereafter.
   *
   * Exposed for the LLM model suppliers and tests; the caching strategy is
   * an implementation detail and not part of the stable public API.
   * @returns {string} The current chart data as a JSON string
   */
  public getDataJson(): string {
    if (this.cachedJson === null) {
      this.cachedJson = JSON.stringify(this.data);
    }
    return this.cachedJson;
  }

  /**
   * Freezes what the AI is grounded on: the plot image exactly as it looks now
   * (highlight on the focused point included), the verbose description of that
   * point, and the MAIDR JSON.
   *
   * Call it at the moment the user triggers a question and hand the result to
   * every provider answering it, so they share one rasterisation and none of
   * them sees a plot the user has since navigated away from. The plot is
   * serialised synchronously inside this call; only the decode and JPEG
   * encoding that follow are asynchronous, and they work from that copy.
   * @returns {ChatSnapshot} The frozen context for one question
   */
  public captureSnapshot(): ChatSnapshot {
    return {
      image: Svg.toBase64(this.display.plot),
      positionText: this.textService.getVerboseText() ?? '',
      json: this.getDataJson(),
    };
  }

  /**
   * Refreshes the chart data shared with the LLM providers after a live
   * data update, so AI answers reflect the data currently on screen.
   * Serialization is deferred until the next LLM request.
   * @param {Maidr} maidr - The updated MAIDR data structure
   */
  public updateData(maidr: Maidr): void {
    this.data = maidr;
    this.cachedJson = null;
    this.dataChangedAt = Date.now();
  }

  /**
   * Toggles the focus to the chat scope.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.CHAT);
  }

  /**
   * Aborts any in-flight LLM requests and releases their resources. Invoked
   * from Controller.dispose() when the plot loses focus, so a slow provider
   * cannot keep the request continuation (and its waiting tone) alive for the
   * full request timeout after disposal.
   */
  public dispose(): void {
    for (const controller of this.pendingRequests) {
      controller.abort();
    }
    this.pendingRequests.clear();
  }
}

/**
 * Interface for LLM model implementations.
 */
interface LlmModel {
  getLlmResponse: (request: LlmRequest, snapshot: ChatSnapshot, signal?: AbortSignal) => Promise<LlmResponse>;
}

/**
 * Response structure from OpenAI GPT API. `message.content` is null on a
 * refusal and empty when a reasoning model spends its whole completion
 * budget on reasoning, so it is read defensively.
 */
interface GptResponse {
  choices: {
    message: {
      content: string | null;
    };
  }[];
}

/**
 * Response structure from Anthropic Claude API. Content blocks are a union
 * (text, thinking, tool_use, ...), so both fields are read defensively.
 */
interface ClaudeResponse {
  content: {
    type?: string;
    text?: string;
  }[];
}

/**
 * Response structure from Google Gemini API. Gemini omits `candidates` for
 * blocked prompts, and a candidate finishing with SAFETY or MAX_TOKENS has
 * `content` without `parts`, so every level is optional and read defensively.
 */
interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
}

/**
 * Response structure from the Ollama chat API (non-streaming).
 */
interface OllamaResponse {
  message: {
    content: string;
  };
}

/**
 * Everything a provider builds its request body from.
 */
interface PayloadInput {
  customInstruction: string;
  maidrJson: string;
  /** The plot as a data URL; empty when conversion failed. */
  image: string;
  currentPositionText: string;
  message: string;
  expertise: 'basic' | 'intermediate' | 'advanced';
  history: ChatTurn[];
  version?: LlmVersion;
  /** Whether the chart data block may carry a cache breakpoint. */
  cacheData: boolean;
}

/**
 * One message of the conversation in a provider-neutral shape. A user message
 * is several text blocks, so a provider that can address the chart data block
 * on its own (to cache it) still can.
 */
interface ConversationMessage {
  role: 'user' | 'assistant';
  blocks: string[];
}

/**
 * Lays the conversation out the same way for every provider: earlier
 * questions and answers as text, then the current question, with the chart
 * data leading the first user message. The data is stated once and stays the
 * front of every request however long the conversation gets; the plot image
 * belongs to the current question only, and providers attach it themselves.
 * @param {PayloadInput} input - What the request is built from
 * @returns {ConversationMessage[]} Alternating user and assistant messages,
 * starting and ending with the user
 */
function buildConversation(input: PayloadInput): ConversationMessage[] {
  const question = (currentPositionText: string, message: string): string => {
    const context: PromptContext = {
      customInstruction: input.customInstruction,
      maidrJson: input.maidrJson,
      currentPositionText,
      message,
      expertiseLevel: input.expertise,
    };
    return formatUserPrompt(context);
  };

  const messages: ConversationMessage[] = input.history.flatMap((turn): ConversationMessage[] => [
    { role: 'user', blocks: [question(turn.positionText, turn.question)] },
    { role: 'assistant', blocks: [turn.answer] },
  ]);
  messages.push({ role: 'user', blocks: [question(input.currentPositionText, input.message)] });
  messages[0].blocks.unshift(formatDataPrompt(input.maidrJson));
  return messages;
}

/**
 * Strips the data-URL prefix: the Anthropic, Gemini and Ollama APIs want raw
 * base64.
 * @param {string} image - The plot as a data URL, or empty
 * @returns {string} The raw base64, or empty when there is no image
 */
function rawBase64(image: string): string {
  return image.includes(',') ? image.split(',')[1] : image;
}

/**
 * Abstract base class for LLM model implementations providing common functionality.
 * @template T - The response type specific to the LLM provider
 */
abstract class AbstractLlmModel<T> implements LlmModel {
  private readonly maidrBaseUrl: string;
  private readonly codeQueryParam: string;

  /**
   * Creates a new AbstractLlmModel instance.
   */
  protected constructor() {
    this.maidrBaseUrl = 'https://maidr-service.azurewebsites.net/api';
    this.codeQueryParam = 'I8Aa2PlPspjQ8Hks0QzGyszP8_i2-XJ3bq7Xh8-ykEe4AzFuYn_QWA%3D%3D';
  }

  /**
   * Sends a request to the LLM and returns the formatted response.
   * @param {LlmRequest} request - The request containing the message and configuration
   * @param {ChatSnapshot} snapshot - The plot state frozen when the question was asked
   * @param {AbortSignal} [signal] - Aborts the in-flight request on disposal
   * @returns {Promise<LlmResponse>} The formatted response from the LLM
   */
  public async getLlmResponse(request: LlmRequest, snapshot: ChatSnapshot, signal?: AbortSignal): Promise<LlmResponse> {
    try {
      const image = await snapshot.image;
      // When expertise is 'custom', use 'advanced' as the base level since custom instructions will override
      const expertiseLevel = request.expertise === 'custom' ? 'advanced' : request.expertise;

      const payload = this.getPayload({
        customInstruction: request.customInstruction,
        maidrJson: snapshot.json,
        image,
        currentPositionText: snapshot.positionText,
        message: request.message,
        expertise: expertiseLevel,
        history: request.history ?? [],
        version: request.version,
        // Only the direct Anthropic call sets a cache breakpoint; the MAIDR
        // proxy's handling of the field is not known.
        cacheData: !request.clientToken,
      });

      const url = request.clientToken
        ? this.getMaidrUrl()
        : this.getApiUrl(request.apiKey, request.version);

      const headers = this.getHeaders(request);
      const response = await this.post(url, payload, headers, signal);
      if (!response.success) {
        return {
          success: false,
          error: response.error?.message,
        };
      } else if (!response.data) {
        return {
          success: false,
          error: t('llm.errorResponseUnavailable'),
        };
      } else {
        return this.formatResponse(response.data);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : t('llm.errorUnknown'),
      };
    }
  }

  /**
   * Posts the request through {@link Api.post}, cancelling it when `signal`
   * aborts (Controller disposal). The signal is handed to fetch, so the
   * socket, the response body and the JSON parse stop with it rather than
   * running on for the remainder of LLM_REQUEST_TIMEOUT_MS; the race below
   * additionally releases this request's continuation — and the chat's
   * waiting tone — the moment disposal happens.
   * @param {string} url - The request URL
   * @param {string} payload - The serialized request body
   * @param {Record<string, string>} headers - The request headers
   * @param {AbortSignal} [signal] - Aborts the pending request on disposal
   * @returns {Promise<ApiResponse<T>>} The provider response
   */
  private async post(
    url: string,
    payload: string,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<ApiResponse<T>> {
    // Disposal can land while the plot is still being rasterised, which is
    // long enough to matter on a dense chart. Sending the request anyway
    // spends the user's tokens on an answer nothing will ever show.
    if (signal?.aborted) {
      return {
        success: false,
        error: {
          statusCode: HttpStatus.SERVER_ERROR,
          message: t('llm.errorAborted'),
        },
      };
    }

    const request = Api.post<T>(url, payload, headers, LLM_REQUEST_TIMEOUT_MS, signal);
    if (!signal) {
      return request;
    }

    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new Error(t('llm.errorAborted')));
        return;
      }
      signal.addEventListener(
        'abort',
        () => reject(new Error(t('llm.errorAborted'))),
        { once: true },
      );
    });

    return Promise.race([request, aborted]);
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
   * @param {LlmVersion} [version] - The user-selected model version, for providers
   * (e.g. Gemini) that encode the model in the URL
   * @returns {string} The API URL
   */
  protected abstract getApiUrl(apiKey?: string, version?: LlmVersion): string;

  /**
   * Gets the endpoint name for MAIDR service routing.
   * @returns {string} The endpoint name
   */
  protected abstract getEndPoint(): string;

  /**
   * Constructs the request payload for the specific LLM provider.
   * @param {PayloadInput} input - What the request is built from
   * @returns {string} The JSON payload
   */
  protected abstract getPayload(input: PayloadInput): string;

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
   * @param {GptVersion} version - The GPT model version to use
   */
  public constructor(version: GptVersion) {
    super();
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
   * @param {PayloadInput} input - What the request is built from
   * @returns {string} The JSON payload for GPT API
   */
  protected getPayload(input: PayloadInput): string {
    const conversation = buildConversation(input);
    const last = conversation.length - 1;

    return JSON.stringify({
      model: input.version ?? this.version,
      // GPT-5-family and o-series models reject the legacy `max_tokens`;
      // `max_completion_tokens` is accepted by every current OpenAI chat model.
      max_completion_tokens: GPT_MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content: formatSystemPrompt(input.customInstruction, input.expertise),
        },
        ...conversation.map((message, index) => message.role === 'assistant'
          ? { role: 'assistant', content: message.blocks.join('\n\n') }
          : {
              role: 'user',
              // The chart data leads, so OpenAI's automatic prompt caching can
              // reuse it across questions about the same chart.
              content: [
                ...message.blocks.map(text => ({ type: 'text', text })),
                // Omit the image when SVG conversion produced nothing; OpenAI
                // rejects an empty image URL, unlike the other providers.
                ...(index === last && input.image
                  ? [{ type: 'image_url', image_url: { url: input.image } }]
                  : []),
              ],
            }),
      ],
    });
  }

  /**
   * Formats the GPT response into a standard LlmResponse.
   * @param {GptResponse} response - The raw response from GPT API
   * @returns {LlmResponse} The formatted response
   */
  protected formatResponse(response: GptResponse): LlmResponse {
    // An empty or null content is not an answer: a refusal returns null, and
    // a reasoning model that exhausts max_completion_tokens on reasoning
    // returns ''. Reported as a success, both put an empty bubble in the
    // transcript with nothing for the live region to announce.
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return {
        success: false,
        error: t('llm.errorInvalidFormat'),
      };
    }

    return {
      success: true,
      data: content,
    };
  }
}

/**
 * Anthropic Claude model implementation.
 */
class Claude extends AbstractLlmModel<ClaudeResponse> {
  private readonly version: ClaudeVersion;

  /**
   * Creates a new Claude model instance.
   * @param {ClaudeVersion} version - The Claude model version to use
   */
  public constructor(version: ClaudeVersion) {
    super();
    this.version = version;
  }

  /**
   * Gets the Anthropic messages API URL.
   * @returns {string} The Anthropic messages API URL
   */
  protected getApiUrl(): string {
    return 'https://api.anthropic.com/v1/messages';
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
   * @param {PayloadInput} input - What the request is built from
   * @returns {string} The JSON payload for Claude API
   */
  protected getPayload(input: PayloadInput): string {
    const conversation = buildConversation(input);
    const last = conversation.length - 1;
    const raw = rawBase64(input.image);
    const text = (value: string): { type: string; text: string } => ({ type: 'text', text: value });

    return JSON.stringify({
      model: input.version ?? this.version,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: formatSystemPrompt(input.customInstruction, input.expertise),
      messages: conversation.map((message, index) => {
        if (message.role === 'assistant') {
          return { role: 'assistant', content: message.blocks.map(text) };
        }
        const blocks: object[] = message.blocks.map(text);
        // The chart data is the stable front of the conversation. The cache
        // breakpoint on it lets the system prompt and the data be read from
        // cache on the next question about this chart.
        if (index === 0 && input.cacheData) {
          blocks[0] = { ...text(message.blocks[0]), cache_control: { type: 'ephemeral' } };
        }
        // The image goes just ahead of the current question.
        if (index === last && raw) {
          blocks.splice(blocks.length - 1, 0, {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: raw },
          });
        }
        return { role: 'user', content: blocks };
      }),
    });
  }

  /**
   * Formats the Claude response into a standard LlmResponse. The first text
   * block is used: models that think by default (e.g. Claude Opus 5, Claude
   * Fable 5.1) emit thinking blocks before the text block, so position 0
   * cannot be assumed.
   * @param {ClaudeResponse} response - The raw response from Claude API
   * @returns {LlmResponse} The formatted response
   */
  protected formatResponse(response: ClaudeResponse): LlmResponse {
    const textBlock = response.content?.find(block => block.type === 'text' && block.text);
    if (!textBlock?.text) {
      return {
        success: false,
        error: t('llm.errorInvalidFormat'),
      };
    }

    return {
      success: true,
      data: textBlock.text,
    };
  }

  /**
   * Builds HTTP headers for Claude requests. Direct calls authenticate via
   * x-api-key (not a bearer token) and need the direct-browser-access opt-in
   * for CORS, so they build their own headers rather than amending the base
   * class's bearer-style credentials; the MAIDR-proxy path keeps the
   * base-class Authentication header.
   * @param {LlmRequest} request - The request containing authentication details
   * @returns {Record<string, string>} The HTTP headers
   */
  protected override getHeaders(request: LlmRequest): Record<string, string> {
    if (request.clientToken) {
      const headers = super.getHeaders(request);
      headers['anthropic-version'] = ANTHROPIC_API_VERSION;
      return headers;
    }
    return {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
      // Required for direct browser calls; the key is the user's own,
      // entered client-side, so direct access is the intended model.
      'anthropic-dangerous-direct-browser-access': 'true',
      ...(request.apiKey ? { 'x-api-key': request.apiKey } : {}),
    };
  }
}

/**
 * Google Gemini model implementation.
 */
class Gemini extends AbstractLlmModel<GeminiResponse> {
  private readonly version: GeminiVersion;

  /**
   * Creates a new Gemini model instance.
   * @param {GeminiVersion} version - The Gemini model version to use
   */
  public constructor(version: GeminiVersion) {
    super();
    this.version = version;
  }

  /**
   * Gets the Google Gemini API URL with embedded API key and model.
   * @param {string} apiKey - The API key for authentication
   * @param {LlmVersion} [version] - The user-selected model version, overriding the default
   * @returns {string} The Gemini API URL
   * @throws {Error} If API key is not provided
   */
  protected getApiUrl(apiKey: string, version?: LlmVersion): string {
    if (!apiKey) {
      throw new Error(t('llm.errorGeminiKeyRequired'));
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${version ?? this.version}:generateContent?key=${apiKey}`;
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
   * @param {PayloadInput} input - What the request is built from
   * @returns {string} The JSON payload for Gemini API
   */
  protected getPayload(input: PayloadInput): string {
    const conversation = buildConversation(input);
    const last = conversation.length - 1;
    const raw = rawBase64(input.image);
    const systemPrompt = formatSystemPrompt(input.customInstruction, input.expertise);

    return JSON.stringify({
      generationConfig: {
        maxOutputTokens: GEMINI_MAX_TOKENS,
      },
      safetySettings: [],
      contents: conversation.map((message, index) => {
        // Instructions and chart data first and unchanged between questions,
        // so Gemini's implicit caching can reuse that prefix.
        const blocks = index === 0 ? [systemPrompt, ...message.blocks] : message.blocks;
        return {
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [
            { text: blocks.join('\n\n') },
            // Omit the image part entirely when conversion produced nothing.
            ...(index === last && raw
              // Svg.toBase64 rasterizes the SVG to JPEG via canvas.
              ? [{ inlineData: { data: raw, mimeType: 'image/jpeg' } }]
              : []),
          ],
        };
      }),
    });
  }

  /**
   * Formats the Gemini response into a standard LlmResponse.
   * @param {GeminiResponse} response - The raw response from Gemini API
   * @returns {LlmResponse} The formatted response
   */
  protected formatResponse(response: GeminiResponse): LlmResponse {
    // Blocked prompts (no candidates) and SAFETY/MAX_TOKENS finishes (a
    // candidate without parts) must degrade to a clear error rather than a
    // raw TypeError from a missing dereference.
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return {
        success: false,
        error: t('llm.errorInvalidFormat'),
      };
    }

    return {
      success: true,
      data: text,
    };
  }

  /**
   * Builds HTTP headers for Gemini requests, removing Authorization header as API key is in URL.
   * @param {LlmRequest} request - The request containing authentication details
   * @returns {Record<string, string>} The HTTP headers
   */
  protected override getHeaders(request: LlmRequest): Record<string, string> {
    const headers = super.getHeaders(request);
    // Gemini uses API key in URL, so we don't need to add it to headers
    delete headers.Authorization;
    return headers;
  }
}

/**
 * Ollama local model implementation. Talks to a locally running Ollama server
 * (https://ollama.com) so users can analyze sensitive data offline without an
 * API key. The request's `apiKey` field carries the server base URL.
 */
class Ollama extends AbstractLlmModel<OllamaResponse> {
  private readonly version: OllamaVersion;

  /**
   * Creates a new Ollama model instance.
   * @param {OllamaVersion} version - The default Ollama model to use when none is selected
   */
  public constructor(version: OllamaVersion) {
    super();
    this.version = version;
  }

  /**
   * Gets the Ollama chat API URL on the configured local server. Settings can
   * be saved with an unvalidated URL, so the same scheme guard used by the
   * reachability probe applies here; the thrown error is caught by
   * getLlmResponse and surfaced as a chat error message.
   * @param {string} [baseUrl] - The Ollama server base URL (stored in the apiKey field)
   * @returns {string} The Ollama chat API URL
   * @throws {Error} If the base URL does not use an http(s) scheme
   */
  protected getApiUrl(baseUrl?: string): string {
    if (!isValidOllamaBaseUrl(baseUrl)) {
      throw new Error(t('llm.errorOllamaUrl'));
    }
    return `${normalizeOllamaBaseUrl(baseUrl)}/api/chat`;
  }

  /**
   * Required by the abstract contract, but the MAIDR proxy path
   * (clientToken) can never apply to a local Ollama server — requests always
   * go directly to the user's machine, so routing here is a configuration
   * error and fails loudly.
   * @throws {Error} Always; Ollama requests cannot be proxied
   */
  protected getEndPoint(): string {
    throw new Error(t('llm.errorOllamaProxy'));
  }

  /**
   * Constructs the Ollama-specific request payload using the native chat API.
   * @param {PayloadInput} input - What the request is built from
   * @returns {string} The JSON payload for the Ollama chat API
   */
  protected getPayload(input: PayloadInput): string {
    const conversation = buildConversation(input);
    const last = conversation.length - 1;
    // Multimodal models (e.g. llava, llama3.2-vision) use the image; text-only
    // models ignore it. Omit the field entirely if conversion produced nothing.
    const raw = rawBase64(input.image);

    return JSON.stringify({
      model: input.version ?? this.version,
      stream: false,
      options: {
        num_predict: OLLAMA_MAX_TOKENS,
      },
      messages: [
        {
          role: 'system',
          content: formatSystemPrompt(input.customInstruction, input.expertise),
        },
        ...conversation.map((message, index) => ({
          role: message.role,
          content: message.blocks.join('\n\n'),
          ...(index === last && raw ? { images: [raw] } : {}),
        })),
      ],
    });
  }

  /**
   * Formats the Ollama response into a standard LlmResponse.
   * @param {OllamaResponse} response - The raw response from the Ollama chat API
   * @returns {LlmResponse} The formatted response
   */
  protected formatResponse(response: OllamaResponse): LlmResponse {
    if (!response.message?.content) {
      return {
        success: false,
        error: t('llm.errorInvalidFormat'),
      };
    }

    return {
      success: true,
      data: response.message.content,
    };
  }

  /**
   * Builds HTTP headers for Ollama requests. The local server needs no
   * authentication (the apiKey field holds the base URL), so the base-class
   * credential headers are intentionally not used.
   * @param {LlmRequest} _request - The request containing connection details (unused)
   * @returns {Record<string, string>} The HTTP headers
   */
  protected override getHeaders(_request: LlmRequest): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }
}
