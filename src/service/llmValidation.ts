import type { Llm } from '@type/llm';
import { DEFAULT_OLLAMA_BASE_URL } from '@type/llm';

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
 * Response structure of the Ollama tags endpoint listing installed models.
 */
interface OllamaTagsResponse {
  models?: {
    name: string;
  }[];
}

/**
 * Normalizes an Ollama base URL by trimming whitespace and trailing slashes.
 * @param baseUrl - The user-provided server base URL
 * @returns The normalized base URL
 */
function normalizeOllamaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_OLLAMA_BASE_URL;
}

/**
 * Service for validating API keys across different LLM providers.
 */
export class LlmValidationService {
  private static readonly OPENAI_API_URL = 'https://api.openai.com/v1/models';
  private static readonly ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  private static readonly GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  /**
   * Validates an API key for the specified LLM provider. For Ollama the
   * credential is the local server base URL, so reachability is checked
   * instead of key validity.
   * @param modelKey - The LLM provider identifier
   * @param apiKey - The API key (or Ollama server base URL) to validate
   * @returns Promise resolving to validation result with status and optional error message
   */
  public static async validateApiKey(modelKey: Llm, apiKey: string): Promise<ValidationResponse> {
    try {
      switch (modelKey) {
        case 'OPENAI':
          return await this.validateOpenAiKey(apiKey);
        case 'ANTHROPIC_CLAUDE':
          return await this.validateAnthropicKey(apiKey);
        case 'GOOGLE_GEMINI':
          return await this.validateGeminiKey(apiKey);
        case 'OLLAMA':
          return await this.validateOllamaServer(apiKey);
        default:
          return { isValid: false, error: 'Invalid model key' };
      }
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Validates an OpenAI API key by making a request to the models endpoint.
   * @param apiKey - The OpenAI API key to validate
   * @returns Promise resolving to validation result
   */
  private static async validateOpenAiKey(apiKey: string): Promise<ValidationResponse> {
    try {
      const response = await fetch(this.OPENAI_API_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        return { isValid: true };
      }

      return { isValid: false, error: 'Invalid API key' };
    } catch {
      return { isValid: false, error: 'Invalid API key' };
    }
  }

  /**
   * Validates an Anthropic Claude API key by making a minimal request to the messages endpoint.
   * @param apiKey - The Anthropic API key to validate
   * @returns Promise resolving to validation result
   */
  private static async validateAnthropicKey(apiKey: string): Promise<ValidationResponse> {
    try {
      const response = await fetch(this.ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      }).catch(() => ({ ok: false }));

      if (response.ok) {
        return { isValid: true };
      }

      return { isValid: false, error: 'Invalid API key' };
    } catch {
      return { isValid: false, error: 'Invalid API key' };
    }
  }

  /**
   * Validates that a local Ollama server is reachable by querying its
   * installed-models endpoint (the API equivalent of `ollama ps`/`ollama list`).
   * @param baseUrl - The Ollama server base URL
   * @returns Promise resolving to validation result
   */
  private static async validateOllamaServer(baseUrl: string): Promise<ValidationResponse> {
    const unreachable: ValidationResponse = {
      isValid: false,
      error: 'Cannot reach Ollama server. Make sure Ollama is running and, for non-localhost pages, that OLLAMA_ORIGINS allows this site.',
    };
    try {
      const response = await fetch(`${normalizeOllamaBaseUrl(baseUrl)}/api/tags`, {
        method: 'GET',
      }).catch(() => ({ ok: false }));

      if (response.ok) {
        return { isValid: true };
      }

      return unreachable;
    } catch {
      return unreachable;
    }
  }

  /**
   * Fetches the list of models installed on a local Ollama server.
   * @param baseUrl - The Ollama server base URL
   * @returns Promise resolving to the installed model names, or an empty array if unreachable
   */
  public static async fetchOllamaModels(baseUrl: string): Promise<string[]> {
    try {
      const response = await fetch(`${normalizeOllamaBaseUrl(baseUrl)}/api/tags`, {
        method: 'GET',
      });
      if (!response.ok) {
        return [];
      }

      const data = await response.json() as OllamaTagsResponse;
      return (data.models ?? []).map(model => model.name);
    } catch {
      return [];
    }
  }

  /**
   * Validates a Google Gemini API key by making a request to the models endpoint.
   * @param apiKey - The Google Gemini API key to validate
   * @returns Promise resolving to validation result
   */
  private static async validateGeminiKey(apiKey: string): Promise<ValidationResponse> {
    try {
      const response = await fetch(`${this.GEMINI_API_URL}?key=${apiKey}`, {
        method: 'GET',
      }).catch(() => ({ ok: false }));

      if (response.ok) {
        return { isValid: true };
      }

      return { isValid: false, error: 'Invalid API key' };
    } catch {
      return { isValid: false, error: 'Invalid API key' };
    }
  }
}
