import type { Status } from './event';

export type Llm
  = | 'OPENAI'
    | 'ANTHROPIC_CLAUDE'
    | 'GOOGLE_GEMINI';

export type GptVersion = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4.1' | 'o1-mini' | 'o3' | 'o4-mini';
export type ClaudeVersion = 'claude-3-5-haiku-latest' | 'claude-3-5-sonnet-latest' | 'claude-3-7-sonnet-latest';
export type GeminiVersion = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-flash-preview-04-17' | 'gemini-2.5-pro-preview-05-06';

export type LlmVersion = GptVersion | ClaudeVersion | GeminiVersion;

export interface LlmRequest {
  message: string;
  customInstruction: string;
  expertise: 'basic' | 'intermediate' | 'advanced';
  apiKey?: string;
  email?: string;
  clientToken?: string;
}

export interface LlmResponse {
  success: boolean;
  data?: string;
  error?: string;
}

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

export interface LlmModelSettings {
  name: string;
  apiKey: string;
  enabled: boolean;
  version: LlmVersion;
}
