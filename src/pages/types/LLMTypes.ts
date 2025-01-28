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
