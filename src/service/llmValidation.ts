import type { Llm } from '@type/llm';
import { isValidOllamaBaseUrl, normalizeOllamaBaseUrl } from '@util/llm';

// Local servers have no infrastructure-level timeouts, so cap the probe to
// keep the settings UI from spinning indefinitely on a hung Ollama instance.
const OLLAMA_PROBE_TIMEOUT_MS = 5000;

// Cloud model-list endpoints are normally fast; the cap just keeps the
// settings UI responsive on degraded networks.
const CLOUD_PROBE_TIMEOUT_MS = 10000;

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';
const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const ANTHROPIC_API_VERSION = '2023-06-01';

// The OpenAI models endpoint lists every model the key can access, including
// audio, image, and embedding models that cannot serve the chat flow. Keep
// chat-capable families and drop modality-specific variants.
const OPENAI_CHAT_MODEL_PATTERN = /^(?:gpt-|chatgpt-|o\d)/;
const OPENAI_NON_CHAT_SUBSTRINGS = [
  'audio',
  'realtime',
  'transcribe',
  'tts',
  'whisper',
  'embedding',
  'moderation',
  'image',
  'dall-e',
  'search',
  'instruct',
];

/**
 * Represents the result of an API key validation attempt.
 */
interface ValidationResponse {
  /** Indicates whether the API key is valid */
  isValid: boolean;
  /** Optional error message if validation failed */
  error?: string;
}

/**
 * Result of probing an LLM provider: credential validity plus the models the
 * credential can access, so a single request answers both questions.
 */
export interface ProviderProbeResult {
  /** Indicates whether the credential (or local server) is usable */
  isValid: boolean;
  /** Chat-capable models available to this credential (empty on failure) */
  models: string[];
  /** Optional error message if the probe failed */
  error?: string;
}

/**
 * Result of probing a local Ollama server: reachability plus the installed
 * models, so a single request can answer both questions.
 */
export interface OllamaProbeResult {
  /** Indicates whether the Ollama server responded successfully */
  reachable: boolean;
  /** Names of the models installed on the server (empty when unreachable) */
  models: string[];
}

/**
 * Response structure of the Ollama tags endpoint listing installed models.
 */
interface OllamaTagsResponse {
  models?: {
    name: string;
  }[];
}

/**
 * Response structure of the OpenAI and Anthropic models endpoints.
 */
interface ModelListResponse {
  data?: {
    id: string;
  }[];
}

/**
 * Response structure of the Gemini models endpoint.
 */
interface GeminiModelListResponse {
  models?: {
    name: string;
    supportedGenerationMethods?: string[];
  }[];
}

/**
 * Service for validating credentials and discovering available models across
 * LLM providers.
 */
export class LlmValidationService {
  /**
   * Validates an API key for the specified LLM provider. For Ollama the
   * credential is the local server base URL, so reachability is checked
   * instead of key validity.
   * @param modelKey - The LLM provider identifier
   * @param apiKey - The API key (or Ollama server base URL) to validate
   * @returns Promise resolving to validation result with status and optional error message
   */
  public static async validateApiKey(modelKey: Llm, apiKey: string): Promise<ValidationResponse> {
    const { isValid, error } = await this.probeProvider(modelKey, apiKey);
    return { isValid, error };
  }

  /**
   * Probes an LLM provider with the given credential, answering both
   * credential validity and the list of available models with a single
   * request. This is what keeps model dropdowns current: the lists come from
   * the provider at use time instead of only from the curated catalog.
   * @param modelKey - The LLM provider identifier
   * @param apiKey - The API key (or Ollama server base URL)
   * @returns Promise resolving to the probe result
   */
  public static async probeProvider(modelKey: Llm, apiKey: string): Promise<ProviderProbeResult> {
    try {
      switch (modelKey) {
        case 'OPENAI':
          return await this.probeOpenAi(apiKey);
        case 'ANTHROPIC_CLAUDE':
          return await this.probeAnthropic(apiKey);
        case 'GOOGLE_GEMINI':
          return await this.probeGemini(apiKey);
        case 'OLLAMA': {
          const { reachable, models } = await this.probeOllamaServer(apiKey);
          return {
            isValid: reachable,
            models,
            error: reachable
              ? undefined
              : 'Cannot reach Ollama server. Make sure Ollama is running and, for non-localhost pages, that OLLAMA_ORIGINS allows this site.',
          };
        }
        default:
          return { isValid: false, models: [], error: 'Invalid model key' };
      }
    } catch (error) {
      return {
        isValid: false,
        models: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Probes the OpenAI models endpoint, validating the key and collecting the
   * chat-capable models it can access.
   * @param apiKey - The OpenAI API key
   * @returns Promise resolving to the probe result
   */
  private static async probeOpenAi(apiKey: string): Promise<ProviderProbeResult> {
    try {
      const response = await fetch(OPENAI_MODELS_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(CLOUD_PROBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { isValid: false, models: [], error: 'Invalid API key' };
      }

      const data = await response.json() as ModelListResponse;
      const models = (data.data ?? [])
        .map(model => model.id)
        .filter(id =>
          OPENAI_CHAT_MODEL_PATTERN.test(id)
          && !OPENAI_NON_CHAT_SUBSTRINGS.some(substring => id.includes(substring)),
        )
        // Reverse-lexicographic puts newer families (gpt-5.x) before older
        // ones (gpt-4x) — a rough but dependency-free recency ordering.
        .sort()
        .reverse();
      return { isValid: true, models };
    } catch {
      return { isValid: false, models: [], error: 'Invalid API key' };
    }
  }

  /**
   * Probes the Anthropic models endpoint, validating the key and collecting
   * the available Claude models. The endpoint already returns chat models
   * only, newest first.
   * @param apiKey - The Anthropic API key
   * @returns Promise resolving to the probe result
   */
  private static async probeAnthropic(apiKey: string): Promise<ProviderProbeResult> {
    try {
      const response = await fetch(`${ANTHROPIC_MODELS_URL}?limit=100`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
          // Required for direct browser calls; the key is the user's own,
          // entered client-side, so direct access is the intended model.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        signal: AbortSignal.timeout(CLOUD_PROBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { isValid: false, models: [], error: 'Invalid API key' };
      }

      const data = await response.json() as ModelListResponse;
      return { isValid: true, models: (data.data ?? []).map(model => model.id) };
    } catch {
      return { isValid: false, models: [], error: 'Invalid API key' };
    }
  }

  /**
   * Probes the Gemini models endpoint, validating the key and collecting the
   * models that support text generation.
   * @param apiKey - The Google Gemini API key
   * @returns Promise resolving to the probe result
   */
  private static async probeGemini(apiKey: string): Promise<ProviderProbeResult> {
    try {
      const response = await fetch(`${GEMINI_MODELS_URL}?key=${apiKey}&pageSize=200`, {
        method: 'GET',
        signal: AbortSignal.timeout(CLOUD_PROBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { isValid: false, models: [], error: 'Invalid API key' };
      }

      const data = await response.json() as GeminiModelListResponse;
      const models = (data.models ?? [])
        .filter(model =>
          model.supportedGenerationMethods?.includes('generateContent')
          && !model.name.includes('embedding')
          && !model.name.includes('image')
          && !model.name.includes('tts')
          && !model.name.includes('audio'),
        )
        .map(model => model.name.replace(/^models\//, ''))
        .sort()
        .reverse();
      return { isValid: true, models };
    } catch {
      return { isValid: false, models: [], error: 'Invalid API key' };
    }
  }

  /**
   * Probes a local Ollama server, answering both reachability and the list of
   * installed models with a single request so callers that need both (e.g.
   * the settings dialog) avoid duplicate round-trips.
   * @param baseUrl - The Ollama server base URL
   * @returns Promise resolving to the probe result
   */
  public static async probeOllamaServer(baseUrl: string): Promise<OllamaProbeResult> {
    const url = normalizeOllamaBaseUrl(baseUrl);
    // Note: blank input normalizes to the localhost default and therefore
    // passes this check; truly empty fields are guarded upstream before the
    // probe is ever invoked.
    if (!isValidOllamaBaseUrl(url)) {
      return { reachable: false, models: [] };
    }
    try {
      const response = await fetch(`${url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(OLLAMA_PROBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { reachable: false, models: [] };
      }

      const data = await response.json() as OllamaTagsResponse;
      return { reachable: true, models: (data.models ?? []).map(model => model.name) };
    } catch {
      return { reachable: false, models: [] };
    }
  }

  /**
   * Fetches the list of models installed on a local Ollama server.
   * @param baseUrl - The Ollama server base URL
   * @returns Promise resolving to the installed model names, or an empty array if unreachable
   */
  public static async fetchOllamaModels(baseUrl: string): Promise<string[]> {
    const { models } = await this.probeOllamaServer(baseUrl);
    return models;
  }
}
