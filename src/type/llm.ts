import type { Status } from './event';

/**
 * Supported LLM providers for AI chat functionality.
 */
export type Llm
  = | 'OPENAI'
    | 'ANTHROPIC_CLAUDE'
    | 'GOOGLE_GEMINI'
    | 'OLLAMA';

/**
 * Default base URL of a locally running Ollama server.
 */
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Anthropic API protocol version header value (not a model version).
 */
export const ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * Curated OpenAI GPT model versions. The settings dialog also offers the live
 * list fetched from the provider's models API, so saved versions may be any
 * model the user's key can access.
 */
export type GptVersion = 'gpt-5.5' | 'gpt-5.5-pro' | 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.4-nano' | 'gpt-4o';

/**
 * Curated Anthropic Claude model versions.
 */
export type ClaudeVersion = 'claude-fable-5' | 'claude-opus-4-8' | 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'claude-haiku-4-5';

/**
 * Curated Google Gemini model versions.
 */
export type GeminiVersion = 'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite' | 'gemini-2.5-pro' | 'gemini-2.5-flash';

/**
 * Available Ollama model versions. Ollama models are installed locally by the
 * user (`ollama pull <model>`), so any model name is valid. The intersection
 * with `Record<never, never>` keeps autocomplete for the curated suggestions
 * in the union below without restricting the accepted values.
 *
 * Deliberate tradeoff: because this type accepts any string, the LlmVersion
 * union below also widens to accept any string for every provider. That is
 * intentional — model dropdowns are populated from live provider APIs, so
 * valid versions are not limited to the curated literals; correctness is
 * enforced at runtime (getValidVersion, provider responses), not at compile
 * time.
 */
export type OllamaVersion = string & Record<never, never>;

/**
 * Union of all supported LLM model versions across providers.
 */
export type LlmVersion = GptVersion | ClaudeVersion | GeminiVersion | OllamaVersion;

/**
 * Request payload for LLM API calls including message, instructions, and authentication.
 */
export interface LlmRequest {
  message: string;
  customInstruction: string;
  expertise: 'basic' | 'intermediate' | 'advanced' | 'custom';
  /**
   * Provider credential. For cloud providers this is the API key; for Ollama
   * it is the base URL of the local server (no key is required).
   */
  apiKey?: string;
  email?: string;
  clientToken?: string;
  /** Model version selected by the user, overriding the provider default. */
  version?: LlmVersion;
}

/**
 * Response from LLM API containing success status and optional data or error.
 */
export interface LlmResponse {
  success: boolean;
  data?: string;
  error?: string;
}

/**
 * Chat message in the conversation history with metadata and status.
 */
export interface Message {
  id: string;
  text: string;
  isUser: boolean;
  model?: Llm;
  timestamp: string;
  status: Status;
  modelSelections?: {
    modelKey: Llm;
    name: string;
    version: string;
  }[];
  isWelcomeMessage?: boolean;
}

/**
 * Configuration settings for a specific LLM model including API key and version.
 */
export interface LlmModelSettings {
  name: string;
  /** API key for cloud providers; server base URL for Ollama. */
  apiKey: string;
  enabled: boolean;
  version: LlmVersion;
}
