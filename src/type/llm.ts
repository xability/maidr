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
 * Available OpenAI GPT model versions.
 */
export type GptVersion = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4.1' | 'o1-mini' | 'o3' | 'o4-mini';

/**
 * Available Anthropic Claude model versions.
 */
export type ClaudeVersion = 'claude-3-5-haiku-latest' | 'claude-3-5-sonnet-latest' | 'claude-3-7-sonnet-latest';

/**
 * Available Google Gemini model versions.
 */
export type GeminiVersion = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-flash-preview-04-17' | 'gemini-2.5-pro-preview-05-06';

/**
 * Available Ollama model versions. Ollama models are installed locally by the
 * user (`ollama pull <model>`), so any model name is valid. The intersection
 * with `Record<never, never>` keeps autocomplete for the curated suggestions
 * in the union below without restricting the accepted values.
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
