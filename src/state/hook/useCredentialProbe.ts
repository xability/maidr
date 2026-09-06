import type { Llm } from '@type/llm';
import { LlmValidationService } from '@service/llmValidation';
import { useEffect, useState } from 'react';

/** How long typing settles before a probe is sent, in milliseconds. */
const DEBOUNCE_MS = 500;

/**
 * What the settings dialog knows about an LLM credential.
 */
export interface CredentialProbe {
  /** True while a probe is in flight. */
  isValidating: boolean;
  /** Whether the credential works, or null before anything has been probed. */
  isValid: boolean | null;
  /**
   * Why the last probe failed, as the probe itself described it, or null when
   * there is nothing more specific to say than "invalid". Kept so a rate limit
   * or a provider outage is not reported as a bad credential.
   */
  error: string | null;
  /**
   * Models this credential can actually reach, from the provider's models API
   * (or the local Ollama server). Replaces the curated suggestion list.
   */
  models: string[];
}

const IDLE: CredentialProbe = {
  isValidating: false,
  isValid: null,
  error: null,
  models: [],
};

/**
 * Probes an LLM credential as the user types it.
 *
 * This lives in the state layer rather than in the settings dialog because a
 * network side effect is not a component's to own — see `rules/ui.md`. It is
 * the sibling of {@link useOllamaModels}, which reaches the same service for
 * the same reason.
 *
 * The debounce only spaces out request starts; it cannot cancel a request
 * already in flight, so a superseded cycle (a newer keystroke, a provider
 * switch, or unmount) discards its own response. A slow early probe can
 * therefore never overwrite the state of a newer one.
 *
 * @param modelKey - Which provider the credential belongs to
 * @param credential - The API key, or the server URL for Ollama
 * @param enabled - Whether the provider is switched on; probes are skipped
 * when it is not
 * @returns What is currently known about the credential
 */
export function useCredentialProbe(
  modelKey: Llm,
  credential: string,
  enabled: boolean,
): CredentialProbe {
  const [probe, setProbe] = useState<CredentialProbe>(IDLE);

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !credential.trim()) {
      // Also clears the spinner: a superseded in-flight request skips its own
      // cleanup as stale, so this cycle owns the state.
      setProbe(IDLE);
      return;
    }

    const timer = setTimeout(() => {
      setProbe(current => ({ ...current, isValidating: true }));
      // A single probe answers both credential validity and the live list of
      // models the credential can access, for every provider.
      LlmValidationService.probeProvider(modelKey, credential)
        .then((result) => {
          if (!cancelled) {
            setProbe({
              isValidating: false,
              isValid: result.isValid,
              error: result.error ?? null,
              models: result.models,
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProbe({ isValidating: false, isValid: false, error: null, models: [] });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [modelKey, credential, enabled]);

  return probe;
}
