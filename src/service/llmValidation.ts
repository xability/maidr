import type { Llm } from '@type/llm';

interface ValidationResponse {
  isValid: boolean;
  error?: string;
}

export class LlmValidationService {
  private static readonly OPENAI_API_URL = 'https://api.openai.com/v1/models';
  private static readonly ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  private static readonly GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  public static async validateApiKey(modelKey: Llm, apiKey: string): Promise<ValidationResponse> {
    try {
      switch (modelKey) {
        case 'OPENAI':
          return await this.validateOpenAiKey(apiKey);
        case 'ANTHROPIC_CLAUDE':
          return await this.validateAnthropicKey(apiKey);
        case 'GOOGLE_GEMINI':
          return await this.validateGeminiKey(apiKey);
        default:
          return { isValid: false, error: 'Invalid model key' };
      }
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private static async validateOpenAiKey(apiKey: string): Promise<ValidationResponse> {
    try {
      const response = await fetch(this.OPENAI_API_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        return { isValid: true };
      }

      return { isValid: false, error: 'Invalid API key' };
    } catch {
      return { isValid: false, error: 'Invalid API key' };
    }
  }

  private static async validateAnthropicKey(apiKey: string): Promise<ValidationResponse> {
    try {
      const response = await fetch(this.ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      }).catch(() => ({ ok: false }));

      if (response.ok) {
        return { isValid: true };
      }

      return { isValid: false, error: 'Invalid API key' };
    } catch {
      return { isValid: false, error: 'Invalid API key' };
    }
  }

  private static async validateGeminiKey(apiKey: string): Promise<ValidationResponse> {
    try {
      const response = await fetch(`${this.GEMINI_API_URL}?key=${apiKey}`, {
        method: 'GET',
      }).catch(() => ({ ok: false }));

      if (response.ok) {
        return { isValid: true };
      }

      return { isValid: false, error: 'Invalid API key' };
    } catch {
      return { isValid: false, error: 'Invalid API key' };
    }
  }
}
