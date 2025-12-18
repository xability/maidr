import type { Status } from './event';

/**
 * Supported LLM providers for AI chat functionality.
 */
export type Llm
  = | 'OPENAI'
    | 'ANTHROPIC_CLAUDE'
    | 'GOOGLE_GEMINI';

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
 * Union of all supported LLM model versions across providers.
 */
export type LlmVersion = GptVersion | ClaudeVersion | GeminiVersion;

/**
 * Request payload for LLM API calls including message, instructions, and authentication.
 */
export interface LlmRequest {
  message: string;
  customInstruction: string;
  expertise: 'basic' | 'intermediate' | 'advanced' | 'custom';
  apiKey?: string;
  email?: string;
  clientToken?: string;
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
  apiKey: string;
  enabled: boolean;
  version: LlmVersion;
}
