export type Llm =
  | 'CHAT_GPT'
  | 'CLAUDE'
  | 'GEMINI';

export interface LlmRequest {
  message: string;
  customInstruction: string;
  expertise: string;
  apiKey?: string;
  clientToken?: string;
}

export interface LlmResponse {
  data: string;
  error?: string;
}
