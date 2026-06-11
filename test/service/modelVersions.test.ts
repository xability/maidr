import { describe, expect, test } from '@jest/globals';
import { getValidVersion, MODEL_VERSIONS } from '@service/modelVersions';

describe('getValidVersion', () => {
  test('returns a recognized cloud-provider version unchanged', () => {
    expect(getValidVersion('OPENAI', 'o3')).toBe('o3');
  });

  test('falls back to the provider default for an unrecognized cloud version', () => {
    expect(getValidVersion('OPENAI', 'not-a-real-model')).toBe(MODEL_VERSIONS.OPENAI.default);
  });

  test('falls back to the provider default when no version is saved', () => {
    expect(getValidVersion('GOOGLE_GEMINI', undefined)).toBe(MODEL_VERSIONS.GOOGLE_GEMINI.default);
  });

  test('accepts arbitrary non-empty Ollama model names', () => {
    expect(getValidVersion('OLLAMA', 'my-custom-model:7b')).toBe('my-custom-model:7b');
  });

  test('falls back to the Ollama default for a blank model name', () => {
    expect(getValidVersion('OLLAMA', '  ')).toBe(MODEL_VERSIONS.OLLAMA.default);
  });
});
