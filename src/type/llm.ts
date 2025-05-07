import type { Status } from './event';

export type Llm =
  | 'GPT'
  | 'CLAUDE'
  | 'GEMINI';

export type GptVersion = 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo';
export type ClaudeVersion = 'claude-3-opus' | 'claude-3-sonnet' | 'claude-3-haiku';
export type GeminiVersion = 'gemini-pro' | 'gemini-pro-vision';

export interface ModelVersion {
  GPT: GptVersion;
  CLAUDE: ClaudeVersion;
  GEMINI: GeminiVersion;
}

export interface LlmRequest {
  message: string;
  customInstruction: string;
  expertise: string;
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
}
