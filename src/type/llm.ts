import type { Status } from './event';

export type Llm = 'GPT' | 'CLAUDE' | 'GEMINI';

export const LLM_VERSION_MAP = {
  GPT: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o1-mini', 'o3', 'o4-mini'] as const,
  CLAUDE: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'] as const,
  GEMINI: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-preview-04-17', 'gemini-2.5-pro-preview-05-06'] as const,
} as const;

export const GPT_VERSIONS = LLM_VERSION_MAP.GPT;
export type GptVersion = typeof GPT_VERSIONS[number];

export const CLAUDE_VERSIONS = LLM_VERSION_MAP.CLAUDE;
export type ClaudeVersion = typeof CLAUDE_VERSIONS[number];

export const GEMINI_VERSIONS = LLM_VERSION_MAP.GEMINI;
export type GeminiVersion = typeof GEMINI_VERSIONS[number];

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

export type LlmModel = keyof typeof LLM_VERSION_MAP;
export type LlmVersions = typeof LLM_VERSION_MAP;

export interface LlmRequest<T extends Llm = Llm> {
  message: string;
  customInstruction: string;
  expertise: string;
  version: LlmVersions[T][number];
  apiKey?: string;
  email?: string;
  clientToken?: string;
}
