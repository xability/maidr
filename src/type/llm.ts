import type { Status } from './event';

export type Llm = 'GPT' | 'CLAUDE' | 'GEMINI';

export const GPT_VERSIONS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o1-mini', 'o3', 'o4-mini'] as const;
export type GptVersion = typeof GPT_VERSIONS[number];

export const CLAUDE_VERSIONS = ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'] as const;
export type ClaudeVersion = typeof CLAUDE_VERSIONS[number];

export const GEMINI_VERSIONS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-preview-04-17', 'gemini-2.5-pro-preview-05-06'] as const;
export type GeminiVersion = typeof GEMINI_VERSIONS[number];

export type LlmVersionMap = {
  GPT: GptVersion;
  CLAUDE: ClaudeVersion;
  GEMINI: GeminiVersion;
};

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

// Base request now always includes provider-specific version
export interface BaseLlmRequest<T extends Llm = Llm> {
  message: string;
  customInstruction: string;
  expertise: string;
  version: LlmVersionMap[T];
  apiKey?: string;
  email?: string;
  clientToken?: string;
}

export type LlmRequest<T extends Llm = Llm> = BaseLlmRequest<T>;
