export interface Configuration {
  models: {
    gemini: boolean;
    openai: boolean;
    claude: boolean;
  };
  openAIAPIKey: string;
  geminiAPIKey: string;
  claudeAPIKey: string;
  clientToken: string;
  email: string;
}
