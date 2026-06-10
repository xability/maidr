import { LlmValidationService } from '@service/llmValidation';
import { useEffect, useState } from 'react';

/**
 * Fetches the list of models installed on a local Ollama server so the UI can
 * offer the user's actually available models instead of a static guess.
 * @param baseUrl - The Ollama server base URL, or null to skip fetching
 * @returns The installed model names, or an empty array while loading or unreachable
 */
export function useOllamaModels(baseUrl: string | null): string[] {
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    if (!baseUrl || !baseUrl.trim()) {
      setModels([]);
      return;
    }

    let cancelled = false;
    void LlmValidationService.fetchOllamaModels(baseUrl).then((names) => {
      if (!cancelled) {
        setModels(names);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return models;
}
