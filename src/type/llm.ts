import type { Status } from '@type/event';

/**
 * Supported LLM model types
 * @readonly
 */
export type Llm =
  | 'GPT' // OpenAI GPT models
  | 'CLAUDE' // Anthropic Claude models
  | 'GEMINI'; // Google Gemini models

/**
 * Request structure for LLM API calls
 */
export interface LlmRequest {
  /** User message or query */
  message: string;
  /** Custom instruction for the AI */
  customInstruction: string;
  /** Expertise level for the AI response */
  expertise: string;
  /** Optional API key for direct API access */
  apiKey?: string;
  /** Optional user email for authentication */
  email?: string;
  /** Optional client token for authentication */
  clientToken?: string;
}

/**
 * Standardized response structure from LLM API calls
 */
export interface LlmResponse {
  /** Whether the request was successful */
  success: boolean;
  /** The response text when successful */
  data?: string;
  /** Error message when unsuccessful */
  error?: string;
}

/**
 * Chat message structure for the conversation history
 */
export interface Message {
  /** Unique message identifier */
  id: string;
  /** Message content */
  text: string;
  /** Whether the message is from the user (true) or AI (false) */
  isUser: boolean;
  /** The LLM model used for AI responses */
  model?: Llm;
  /** Message timestamp */
  timestamp: string;
  /** Message status */
  status: Status;
}
