import { afterAll, afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { LlmValidationService } from '@service/llmValidation';

describe('LlmValidationService (Ollama)', () => {
  const fetchMock = jest.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  // Restore the real fetch so the mock cannot leak into other test suites
  // running in the same Jest worker environment.
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  function mockTagsResponse(models: string[]): void {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ models: models.map(name => ({ name })) }),
    } as Response);
  }

  describe('validateApiKey', () => {
    test('reports valid when the Ollama server is reachable', async () => {
      mockTagsResponse(['llama3.2']);

      const result = await LlmValidationService.validateApiKey('OLLAMA', 'http://localhost:11434');

      expect(result.isValid).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        { method: 'GET', signal: expect.any(AbortSignal) },
      );
    });

    test('reports invalid with guidance when the server is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('connection refused'));

      const result = await LlmValidationService.validateApiKey('OLLAMA', 'http://localhost:11434');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Ollama');
    });

    test('normalizes trailing slashes in the base URL', async () => {
      mockTagsResponse([]);

      await LlmValidationService.validateApiKey('OLLAMA', 'http://localhost:11434//');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        { method: 'GET', signal: expect.any(AbortSignal) },
      );
    });

    test('falls back to the default base URL when blank', async () => {
      mockTagsResponse([]);

      await LlmValidationService.validateApiKey('OLLAMA', '   ');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        { method: 'GET', signal: expect.any(AbortSignal) },
      );
    });
  });

  describe('probeProvider (cloud providers)', () => {
    test('OpenAI: validates the key, filters to chat models, newest first', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-5.4-mini', created: 200 },
            { id: 'gpt-5.5', created: 300 },
            // o-series must rank by recency, not bury at the name-sort bottom.
            { id: 'o3', created: 250 },
            { id: 'gpt-4o-audio-preview', created: 400 },
            { id: 'whisper-1', created: 400 },
            { id: 'text-embedding-3-large', created: 400 },
            { id: 'dall-e-3', created: 400 },
          ],
        }),
      } as Response);

      const probe = await LlmValidationService.probeProvider('OPENAI', 'sk-test');

      expect(probe.isValid).toBe(true);
      expect(probe.models).toEqual(['gpt-5.5', 'o3', 'gpt-5.4-mini']);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
        }),
      );
    });

    test('Anthropic: validates via the models endpoint with required headers', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 'claude-opus-4-8' }, { id: 'claude-sonnet-4-6' }],
        }),
      } as Response);

      const probe = await LlmValidationService.probeProvider('ANTHROPIC_CLAUDE', 'sk-ant-test');

      expect(probe.isValid).toBe(true);
      expect(probe.models).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6']);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models?limit=100',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          }),
        }),
      );
    });

    test('Gemini: keeps only text-generation models and strips the name prefix', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
            { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
          ],
        }),
      } as Response);

      const probe = await LlmValidationService.probeProvider('GOOGLE_GEMINI', 'g-key');

      expect(probe.isValid).toBe(true);
      expect(probe.models).toEqual(['gemini-3.5-flash', 'gemini-2.5-pro']);
    });

    test('reports invalid with no models when the provider rejects the key', async () => {
      fetchMock.mockResolvedValue({ ok: false } as Response);

      const probe = await LlmValidationService.probeProvider('OPENAI', 'bad-key');

      expect(probe).toEqual({ isValid: false, models: [], error: 'Invalid API key' });
    });

    test('reports a network failure distinctly from an invalid key', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      const probe = await LlmValidationService.probeProvider('ANTHROPIC_CLAUDE', 'sk-ant-test');

      expect(probe.isValid).toBe(false);
      expect(probe.models).toEqual([]);
      expect(probe.error).not.toBe('Invalid API key');
      expect(probe.error).toContain('network');
    });
  });

  describe('probeOllamaServer', () => {
    test('answers reachability and installed models with a single request', async () => {
      mockTagsResponse(['llama3.2']);

      const probe = await LlmValidationService.probeOllamaServer('http://localhost:11434');

      expect(probe).toEqual({ reachable: true, models: ['llama3.2'] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('reports unreachable without throwing', async () => {
      fetchMock.mockRejectedValue(new Error('connection refused'));

      const probe = await LlmValidationService.probeOllamaServer('http://localhost:11434');

      expect(probe).toEqual({ reachable: false, models: [] });
    });

    test('rejects non-http(s) URLs without making a request', async () => {
      const probe = await LlmValidationService.probeOllamaServer('file:///etc/hosts');

      expect(probe).toEqual({ reachable: false, models: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('probeOllamaServer response edge cases', () => {
    test('returns the installed model names', async () => {
      mockTagsResponse(['llama3.2', 'mistral:latest']);

      const { models } = await LlmValidationService.probeOllamaServer('http://localhost:11434');

      expect(models).toEqual(['llama3.2', 'mistral:latest']);
    });

    test('returns an empty list when the server responds with an error', async () => {
      fetchMock.mockResolvedValue({ ok: false } as Response);

      const probe = await LlmValidationService.probeOllamaServer('http://localhost:11434');

      expect(probe).toEqual({ reachable: false, models: [] });
    });

    test('returns an empty list when the response has no models field', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const probe = await LlmValidationService.probeOllamaServer('http://localhost:11434');

      expect(probe).toEqual({ reachable: true, models: [] });
    });
  });
});
