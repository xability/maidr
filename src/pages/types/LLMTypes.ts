import {Configuration} from './ConfigurationTypes';

export enum LLM {
  OpenAI = 'openai',
  Claude = 'claude',
  Gemini = 'gemini',
}

export interface Message {
  id: number;
  text: string;
  isUser: boolean;
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
