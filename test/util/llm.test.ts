import { describe, expect, test } from '@jest/globals';
import { DEFAULT_OLLAMA_BASE_URL } from '@type/llm';
import { getModelDisplayName, isValidOllamaBaseUrl, normalizeOllamaBaseUrl } from '@util/llm';

describe('normalizeOllamaBaseUrl', () => {
  test('returns an already-clean URL unchanged', () => {
    expect(normalizeOllamaBaseUrl('http://localhost:11434')).toBe('http://localhost:11434');
  });

  test('strips a single trailing slash', () => {
    expect(normalizeOllamaBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434');
  });

  test('strips multiple trailing slashes', () => {
    expect(normalizeOllamaBaseUrl('http://localhost:11434///')).toBe('http://localhost:11434');
  });

  test('trims surrounding whitespace', () => {
    expect(normalizeOllamaBaseUrl('  http://192.168.1.10:11434  ')).toBe('http://192.168.1.10:11434');
  });

  test('falls back to the default for whitespace-only input', () => {
    expect(normalizeOllamaBaseUrl('   ')).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  test('falls back to the default for empty input', () => {
    expect(normalizeOllamaBaseUrl('')).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  test('falls back to the default for undefined input', () => {
    expect(normalizeOllamaBaseUrl(undefined)).toBe(DEFAULT_OLLAMA_BASE_URL);
  });
});

describe('isValidOllamaBaseUrl', () => {
  test('accepts http URLs', () => {
    expect(isValidOllamaBaseUrl('http://localhost:11434')).toBe(true);
  });

  test('accepts https URLs', () => {
    expect(isValidOllamaBaseUrl('https://ollama.example.com')).toBe(true);
  });

  test('rejects non-web schemes', () => {
    expect(isValidOllamaBaseUrl('file:///etc/hosts')).toBe(false);
    expect(isValidOllamaBaseUrl('ftp://example.com')).toBe(false);
  });

  test('accepts blank input via the default base URL fallback', () => {
    expect(isValidOllamaBaseUrl('')).toBe(true);
  });
});

describe('getModelDisplayName', () => {
  test.each([
    ['OPENAI', 'OpenAI'],
    ['ANTHROPIC_CLAUDE', 'Anthropic Claude'],
    ['GOOGLE_GEMINI', 'Google Gemini'],
    ['OLLAMA', 'Ollama'],
  ])('maps %s to %s', (modelKey, displayName) => {
    expect(getModelDisplayName(modelKey)).toBe(displayName);
  });

  test('falls back to a generic name for unknown keys', () => {
    expect(getModelDisplayName('SOMETHING_ELSE')).toBe('AI Assistant');
  });

  test('falls back to a generic name when no key is given', () => {
    expect(getModelDisplayName(undefined)).toBe('AI Assistant');
  });
});
