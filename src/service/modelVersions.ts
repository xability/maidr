import type { LlmVersion } from '@type/llm';

export type GptVersion = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4.1' | 'o1-mini' | 'o3' | 'o4-mini';
export type ClaudeVersion = 'claude-3-5-haiku-latest' | 'claude-3-5-sonnet-latest' | 'claude-3-7-sonnet-latest';
export type GeminiVersion = 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.5-flash-preview-04-17' | 'gemini-2.5-pro-preview-05-06';

export interface ModelConfig<T extends LlmVersion> {
  default: T;
  options: readonly T[];
  labels: Record<T, string>;
}

export interface ModelVersions {
  OPENAI: ModelConfig<GptVersion>;
  ANTHROPIC_CLAUDE: ModelConfig<ClaudeVersion>;
  GOOGLE_GEMINI: ModelConfig<GeminiVersion>;
}

export const MODEL_VERSIONS: ModelVersions = {
  OPENAI: {
    default: 'gpt-4o',
    options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o1-mini', 'o3', 'o4-mini'] as const,
    labels: {
      'gpt-4o': 'GPT-4o',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4.1': 'GPT-4.1',
      'o1-mini': 'o1-mini',
      'o3': 'o3',
      'o4-mini': 'o4-mini',
    },
  },
  ANTHROPIC_CLAUDE: {
    default: 'claude-3-7-sonnet-latest',
    options: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'] as const,
    labels: {
      'claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
      'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
      'claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet',
    },
  },
  GOOGLE_GEMINI: {
    default: 'gemini-2.0-flash',
    options: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-preview-04-17', 'gemini-2.5-pro-preview-05-06'] as const,
    labels: {
      'gemini-2.0-flash': 'Gemini 2.0 Flash',
      'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite',
      'gemini-2.5-flash-preview-04-17': 'Gemini 2.5 Flash Preview',
      'gemini-2.5-pro-preview-05-06': 'Gemini 2.5 Pro Preview',
    },
  },
};
