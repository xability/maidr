import type { Status } from '@type/event';

export type Llm =
  | 'CHAT_GPT'
  | 'CLAUDE'
  | 'GEMINI';

export interface LlmRequest {
  message: string;
  customInstruction: string;
  expertise: string;
  apiKey?: string;
  email?: string;
  clientToken?: string;
}

export interface LlmResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export interface Message {
  id: string;
  text: string;
  isUser: boolean;
  model?: Llm;
  timestamp: string;
  status: Status;
}
