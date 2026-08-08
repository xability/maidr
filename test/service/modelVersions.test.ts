import { describe, expect, test } from '@jest/globals';
import { getValidVersion, MODEL_VERSIONS } from '@service/modelVersions';

describe('getValidVersion', () => {
  test('returns a curated version unchanged', () => {
    expect(getValidVersion('OPENAI', 'gpt-5.4')).toBe('gpt-5.4');
  });

  test('preserves a non-curated version (model dropdowns offer live provider lists)', () => {
    expect(getValidVersion('OPENAI', 'gpt-5.2-pro')).toBe('gpt-5.2-pro');
    expect(getValidVersion('ANTHROPIC_CLAUDE', 'claude-opus-4-5')).toBe('claude-opus-4-5');
  });

  test('falls back to the provider default when no version is saved', () => {
    expect(getValidVersion('GOOGLE_GEMINI', undefined)).toBe(MODEL_VERSIONS.GOOGLE_GEMINI.default);
  });

  test('falls back to the provider default for a blank version', () => {
    expect(getValidVersion('OLLAMA', '  ')).toBe(MODEL_VERSIONS.OLLAMA.default);
  });

  test('accepts arbitrary non-empty Ollama model names', () => {
    expect(getValidVersion('OLLAMA', 'my-custom-model:7b')).toBe('my-custom-model:7b');
  });
});

describe('MODEL_VERSIONS catalog', () => {
  test.each(Object.keys(MODEL_VERSIONS) as (keyof typeof MODEL_VERSIONS)[])(
    '%s default is in its curated options with a label',
    (provider) => {
      const config = MODEL_VERSIONS[provider];
      expect(config.options).toContain(config.default);
      for (const option of config.options) {
        expect((config.labels as Record<string, string>)[option]).toBeTruthy();
      }
    },
  );
});
