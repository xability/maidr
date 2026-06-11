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
