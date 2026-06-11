import type { Llm } from '@type/llm';
import { DEFAULT_OLLAMA_BASE_URL } from '@type/llm';

/**
 * Normalizes an Ollama server base URL by trimming whitespace and trailing
 * slashes, falling back to the default local server when blank.
 * @param baseUrl - The user-provided server base URL
 * @returns The normalized base URL
 */
export function normalizeOllamaBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl ?? '').trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_OLLAMA_BASE_URL;
}

/**
 * Checks that an Ollama base URL uses a plain web scheme. Only http(s) makes
 * sense for an Ollama server, and rejecting anything else avoids handing
 * arbitrary protocols (file:, etc.) to fetch in both the probe and chat paths.
 * @param baseUrl - The user-provided server base URL
 * @returns True when the normalized URL starts with http:// or https://
 */
export function isValidOllamaBaseUrl(baseUrl?: string): boolean {
  return /^https?:\/\//i.test(normalizeOllamaBaseUrl(baseUrl));
}

/**
 * Builds the selectable Ollama model options for a version dropdown: the
 * models installed on the local server when known, otherwise the curated
 * suggestions, always keeping the saved model selectable even when it is
 * missing from the list (e.g. it was removed locally) so the dropdown never
 * loses its current value.
 * @param curatedOptions - The static suggestion list from the model catalog
 * @param installedModels - Models probed from the local server (may be empty)
 * @param savedVersion - The currently saved model name, if any
 * @returns The options to render in the dropdown
 */
export function resolveOllamaVersionOptions(
  curatedOptions: readonly string[],
  installedModels: readonly string[],
  savedVersion?: string,
): string[] {
  const options = installedModels.length > 0 ? [...installedModels] : [...curatedOptions];
  if (savedVersion?.trim() && !options.includes(savedVersion)) {
    options.push(savedVersion);
  }
  return options;
}

/**
 * Converts an LLM provider key to a human-readable display name.
 * @param modelKey - The LLM provider identifier
 * @returns The display name for the provider
 */
export function getModelDisplayName(modelKey?: Llm | string): string {
  switch (modelKey) {
    case 'OPENAI':
      return 'OpenAI';
    case 'ANTHROPIC_CLAUDE':
      return 'Anthropic Claude';
    case 'GOOGLE_GEMINI':
      return 'Google Gemini';
    case 'OLLAMA':
      return 'Ollama';
    default:
      return 'AI Assistant';
  }
}
