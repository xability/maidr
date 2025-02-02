import {ClaudeResponse} from '../utils/llm/ClaudeAIUtils';
import {GeminiResponse} from '../utils/llm/GeminiAIUtils';
import {OpenAIResponse} from '../utils/llm/OpenAIUtils';
import {Configuration} from './ConfigurationTypes';

export enum LLM {
  OpenAI = 'openai',
  Claude = 'claude',
  Gemini = 'gemini',
}

export interface Message {
  id: string | number;
  text: string;
  isUser: boolean;
  model?: string;
  timestamp: string;
}

export const stringToLLMEnum = (model: string): LLM => {
  switch (model) {
    case 'openai':
      return LLM.OpenAI;
    case 'claude':
      return LLM.Claude;
    case 'gemini':
      return LLM.Gemini;
    default:
      return LLM.OpenAI;
  }
};

export const modelStringToPrettyString = (model: string): string => {
  switch (model) {
    case 'openai':
      return 'GPT-4o';
    case 'claude':
      return 'Claude 3.5 Sonnet';
    case 'gemini':
      return 'Gemini 2.0 Flash';
    default:
      return 'OpenAI';
  }
};

export const getAPIKeyFromConfiguration = (
  model: LLM,
  config: Configuration
): string => {
  switch (model) {
    case LLM.OpenAI:
      return config.openAIAPIKey;
    case LLM.Claude:
      return config.claudeAPIKey;
    case LLM.Gemini:
      return config.geminiAPIKey;
    default:
      return '';
  }
};

export type LLMResponse = OpenAIResponse | ClaudeResponse | GeminiResponse;
