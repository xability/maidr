import type { Llm, LlmVersion, OllamaVersion } from '@type/llm';

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
 * Configuration structure for LLM model versions including default, options, and display labels.
 * @template T - The specific model version type extending LlmVersion
 */
export interface ModelConfig<T extends LlmVersion> {
  /** The default model version to use */
  default: T;
  /** All available model versions */
  options: readonly T[];
  /** Human-readable labels for each model version */
  labels: Record<T, string>;
}

/**
 * Complete configuration for all supported LLM providers and their model versions.
 */
export interface ModelVersions {
  /** OpenAI GPT model configuration */
  OPENAI: ModelConfig<GptVersion>;
  /** Anthropic Claude model configuration */
  ANTHROPIC_CLAUDE: ModelConfig<ClaudeVersion>;
  /** Google Gemini model configuration */
  GOOGLE_GEMINI: ModelConfig<GeminiVersion>;
  /** Ollama local model configuration */
  OLLAMA: ModelConfig<OllamaVersion>;
}

/**
 * Configuration object containing default versions, available options, and display labels for all LLM providers.
 */
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
  // Curated suggestions only; the actual list of installed models is probed
  // from the local Ollama server (/api/tags) and replaces these in the UI
  // whenever the server is reachable. See getValidVersion below.
  OLLAMA: {
    default: 'llama3.2',
    options: ['llama3.2', 'llama3.2-vision', 'llama3.1', 'mistral', 'gemma3', 'phi4', 'llava'] as const,
    labels: {
      'llama3.2': 'Llama 3.2',
      'llama3.2-vision': 'Llama 3.2 Vision',
      'llama3.1': 'Llama 3.1',
      'mistral': 'Mistral',
      'gemma3': 'Gemma 3',
      'phi4': 'Phi-4',
      'llava': 'LLaVA',
    },
  },
};

/**
 * Resolves a saved model version to a valid one for the given provider,
 * falling back to the provider default when the saved value is unrecognized.
 * @param modelKey - The LLM provider identifier
 * @param currentVersion - The saved model version, if any
 * @returns The validated model version
 */
export function getValidVersion(
  modelKey: Llm,
  currentVersion: string | undefined,
): LlmVersion {
  const config = MODEL_VERSIONS[modelKey];
  // Ollama models are whatever the user has pulled locally, so any non-empty
  // name is valid even when it is not in the curated suggestion list.
  if (modelKey === 'OLLAMA' && currentVersion?.trim()) {
    return currentVersion as LlmVersion;
  }
  const validOptions = config.options as readonly LlmVersion[];
  if (!currentVersion || !validOptions.includes(currentVersion as LlmVersion)) {
    return config.default;
  }
  return currentVersion as LlmVersion;
}
