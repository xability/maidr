import type { ClaudeVersion, GeminiVersion, GptVersion, Llm, LlmVersion, OllamaVersion } from '@type/llm';

/**
 * Configuration structure for LLM model versions including default, options, and display labels.
 * @template T - The specific model version type extending LlmVersion
 */
export interface ModelConfig<T extends LlmVersion> {
  /** The default model version to use */
  default: T;
  /** Curated model versions offered when the live provider list is unavailable */
  options: readonly T[];
  /** Human-readable labels for each curated model version */
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
 * Curated model catalog: defaults, suggestions, and display labels per provider.
 *
 * These lists are snapshots and inevitably age as providers release and retire
 * models. They are kept fresh through two mechanisms:
 * 1. At runtime, the settings dialog probes each provider's models API with
 *    the user's credentials and offers the live list, so users can always
 *    select models released after this snapshot.
 * 2. `npm run check-models` (scripts/check-model-catalog.mjs, also run weekly
 *    in CI) compares these entries against the live provider APIs and flags
 *    stale ones.
 *
 * Catalog snapshot last verified: 2026-06-12.
 *
 * Formatting note: scripts/check-model-catalog.mjs extracts each provider's
 * `default` and `options` from this file's source text. Keep them as
 * single-quoted string literals inside each provider block (the script fails
 * loudly if the parse drifts, but save it the trouble).
 */
export const MODEL_VERSIONS: ModelVersions = {
  OPENAI: {
    default: 'gpt-5.5',
    options: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4o'] as const,
    labels: {
      'gpt-5.5': 'GPT-5.5',
      'gpt-5.5-pro': 'GPT-5.5 Pro',
      'gpt-5.4': 'GPT-5.4',
      'gpt-5.4-mini': 'GPT-5.4 Mini',
      'gpt-5.4-nano': 'GPT-5.4 Nano',
      'gpt-4o': 'GPT-4o (legacy)',
    },
  },
  ANTHROPIC_CLAUDE: {
    default: 'claude-opus-4-8',
    options: ['claude-fable-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'] as const,
    labels: {
      'claude-fable-5': 'Claude Fable 5',
      'claude-opus-4-8': 'Claude Opus 4.8',
      'claude-opus-4-7': 'Claude Opus 4.7',
      'claude-sonnet-4-6': 'Claude Sonnet 4.6',
      'claude-haiku-4-5': 'Claude Haiku 4.5',
    },
  },
  GOOGLE_GEMINI: {
    default: 'gemini-3.5-flash',
    options: ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash'] as const,
    labels: {
      'gemini-3.5-flash': 'Gemini 3.5 Flash',
      'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
      'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
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
 * Resolves a saved model version for the given provider. Any non-empty saved
 * version is accepted — model dropdowns are populated from each provider's
 * live models API (and the local Ollama server), so valid selections are not
 * limited to the curated catalog above. Only a blank version falls back to
 * the provider default.
 * @param modelKey - The LLM provider identifier
 * @param currentVersion - The saved model version, if any
 * @returns The resolved model version
 */
export function getValidVersion(
  modelKey: Llm,
  currentVersion: string | undefined,
): LlmVersion {
  if (currentVersion?.trim()) {
    return currentVersion as LlmVersion;
  }
  return MODEL_VERSIONS[modelKey].default;
}
