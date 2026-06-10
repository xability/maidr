import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { LlmValidationService } from '@service/llmValidation';

describe('LlmValidationService (Ollama)', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
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
        { method: 'GET' },
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
        { method: 'GET' },
      );
    });

    test('falls back to the default base URL when blank', async () => {
      mockTagsResponse([]);

      await LlmValidationService.validateApiKey('OLLAMA', '   ');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        { method: 'GET' },
      );
    });
  });

  describe('fetchOllamaModels', () => {
    test('returns the installed model names', async () => {
      mockTagsResponse(['llama3.2', 'mistral:latest']);

      const models = await LlmValidationService.fetchOllamaModels('http://localhost:11434');

      expect(models).toEqual(['llama3.2', 'mistral:latest']);
    });

    test('returns an empty list when the server responds with an error', async () => {
      fetchMock.mockResolvedValue({ ok: false } as Response);

      const models = await LlmValidationService.fetchOllamaModels('http://localhost:11434');

      expect(models).toEqual([]);
    });

    test('returns an empty list when the server is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('connection refused'));

      const models = await LlmValidationService.fetchOllamaModels('http://localhost:11434');

      expect(models).toEqual([]);
    });

    test('returns an empty list when the response has no models field', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const models = await LlmValidationService.fetchOllamaModels('http://localhost:11434');

      expect(models).toEqual([]);
    });
  });
});
