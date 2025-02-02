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

export interface SendEmailResponse {
  client_token: string;
  message: string;
}
