export enum LLM {
  GPT4o = 'openai',
  Claude = 'claude',
  Gemini = 'gemini',
}

export interface Message {
  id: number;
  text: string;
  isUser: boolean;
  timestamp: string;
}
