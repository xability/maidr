import type { PayloadAction } from '@reduxjs/toolkit';
import type { AudioService } from '@service/audio';
import type { ChatService } from '@service/chat';
import type { Suggestion } from '@type/chat';
import type { Llm, Message } from '@type/llm';
import type { AppStore, RootState } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { MODEL_VERSIONS } from '@service/modelVersions';
import { AbstractViewModel } from './viewModel';

interface ChatState {
  messages: Message[];
  suggestions: Suggestion[];
}

const initialState: ChatState = {
  messages: [],
  suggestions: [],
};

function getModelDisplayName(modelKey: string): string {
  switch (modelKey) {
    case 'OPENAI':
      return 'OpenAI';
    case 'ANTHROPIC_CLAUDE':
      return 'Anthropic Claude';
    case 'GOOGLE_GEMINI':
      return 'Google Gemini';
    default:
      return 'AI Assistant';
  }
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addUserMessage: (state, action: PayloadAction<{ text: string; timestamp: string }>) => {
      state.messages.push({
        id: `msg-${Date.now()}`,
        text: action.payload.text,
        isUser: true,
        timestamp: action.payload.timestamp,
        status: 'SUCCESS',
      });
    },
    addSystemMessage: (state, action: PayloadAction<{ text: string; timestamp: string; modelSelections?: { modelKey: Llm; name: string; version: string }[]; isWelcomeMessage?: boolean }>) => {
      state.messages.push({
        id: `system-${Date.now()}`,
        text: action.payload.text,
        isUser: false,
        timestamp: action.payload.timestamp,
        status: 'SUCCESS',
        modelSelections: action.payload.modelSelections,
        isWelcomeMessage: action.payload.isWelcomeMessage,
      });
    },
    addPendingResponse: (state, action: PayloadAction<{ model: Llm; timestamp: string }>) => {
      state.messages.push({
        id: `resp-${Date.now()}-${action.payload.model}`,
        text: 'Processing request...',
        isUser: false,
        model: action.payload.model,
        timestamp: action.payload.timestamp,
        status: 'PENDING',
      });
    },
    updateResponse: (state, action: PayloadAction<{ model: Llm; data: string; timestamp: string }>) => {
      const message = state.messages.find(m =>
        m.model === action.payload.model
        && m.timestamp === action.payload.timestamp,
      );
      if (message) {
        message.text = action.payload.data;
        message.status = 'SUCCESS';
      }
    },
    updateError: (state, action: PayloadAction<{ model: Llm; error: string; timestamp: string }>) => {
      const message = state.messages.find(m =>
        m.model === action.payload.model
        && m.timestamp === action.payload.timestamp,
      );
      if (message) {
        message.text = `Error: ${action.payload.error}`;
        message.status = 'FAILED';
      }
    },
    updateSuggestions: (state, action: PayloadAction<Suggestion[]>) => {
      state.suggestions = action.payload;
    },
    updateWelcomeMessage: (state, action: PayloadAction<{ text: string; modelSelections?: { modelKey: Llm; name: string; version: string }[] }>) => {
      // Find the welcome message (first system message with isWelcomeMessage flag)
      const welcomeMessageIndex = state.messages.findIndex(msg => msg.isWelcomeMessage);
      if (welcomeMessageIndex !== -1) {
        state.messages[welcomeMessageIndex].text = action.payload.text;
        if (action.payload.modelSelections) {
          state.messages[welcomeMessageIndex].modelSelections = action.payload.modelSelections;
        }
      }
    },
    reset() {
      return initialState;
    },
  },
});
const { addUserMessage, addSystemMessage, addPendingResponse, updateResponse, updateError, updateSuggestions, updateWelcomeMessage, reset } = chatSlice.actions;

export class ChatViewModel extends AbstractViewModel<ChatState> {
  private readonly chatService: ChatService;
  private readonly audioService: AudioService;

  constructor(store: AppStore, chatService: ChatService, audioService: AudioService) {
    super(store);
    this.chatService = chatService;
    this.audioService = audioService;
    this.loadInitialMessage();
  }

  public dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  public get state(): ChatState {
    return this.snapshot.chat;
  }

  private get snapshot(): Readonly<RootState> {
    return this.store.getState();
  }

  public get canSend(): boolean {
    const { llm } = this.snapshot.settings;
    return Object.values(llm.models).some(model => model.enabled && model.apiKey.trim().length > 0);
  }

  public toggle(): void {
    this.chatService.toggle();
  }

  public loadInitialMessage(): void {
    const timestamp = new Date().toISOString();
    const llmModels = this.snapshot.settings.llm.models;

    const enabledModels = Object.entries(llmModels)
      .filter(([_, cfg]) => cfg.enabled && cfg.apiKey.trim().length > 0)
      .map(([modelKey, cfg]) => {
        const labelMap = MODEL_VERSIONS[modelKey as keyof typeof MODEL_VERSIONS]?.labels;
        const versionLabel = labelMap?.[cfg.version as keyof typeof labelMap] || cfg.version;
        const displayName = getModelDisplayName(modelKey);
        return `${displayName} (${versionLabel})`;
      });

    const modelSelections = Object.entries(llmModels)
      .filter(([_, cfg]) => cfg.enabled && cfg.apiKey.trim().length > 0)
      .map(([modelKey, cfg]) => ({
        modelKey: modelKey as Llm,
        name: getModelDisplayName(modelKey),
        version: cfg.version,
      }));

    const text = enabledModels.length > 0
      ? `Welcome to the Chart Assistant. You can select and switch between different AI models using the dropdowns below. Currently enabled: ${enabledModels.join(', ')}.`
      : 'No agents are enabled. Please enable at least one agent and provide API keys in the settings page.';

    this.store.dispatch(addSystemMessage({
      text,
      timestamp,
      modelSelections,
      isWelcomeMessage: true,
    }));
  }

  public refreshInitialMessage(): void {
    // Clear existing messages and reload initial message
    this.store.dispatch(reset());
    this.loadInitialMessage();
  }

  public updateWelcomeMessage(): void {
    const llmModels = this.snapshot.settings.llm.models;

    const enabledModels = Object.entries(llmModels)
      .filter(([_, cfg]) => cfg.enabled && cfg.apiKey.trim().length > 0)
      .map(([modelKey, cfg]) => {
        const labelMap = MODEL_VERSIONS[modelKey as keyof typeof MODEL_VERSIONS]?.labels;
        const versionLabel = labelMap?.[cfg.version as keyof typeof labelMap] || cfg.version;
        const displayName = getModelDisplayName(modelKey);
        return `${displayName} (${versionLabel})`;
      });

    const modelSelections = Object.entries(llmModels)
      .filter(([_, cfg]) => cfg.enabled && cfg.apiKey.trim().length > 0)
      .map(([modelKey, cfg]) => ({
        modelKey: modelKey as Llm,
        name: getModelDisplayName(modelKey),
        version: cfg.version,
      }));

    const text = enabledModels.length > 0
      ? `Welcome to the Chart Assistant. You can select and switch between different AI models using the dropdowns below. Currently enabled: ${enabledModels.join(', ')}.`
      : 'No agents are enabled. Please enable at least one agent and provide API keys in the settings page.';

    this.store.dispatch(updateWelcomeMessage({
      text,
      modelSelections,
    }));
  }

  private generateSuggestions(): Suggestion[] {
    try {
      const lastMessage = this.state.messages[this.state.messages.length - 1];
      if (!lastMessage || lastMessage.isUser)
        return [];

      const { llm } = this.snapshot.settings;
      const expertise = llm.expertiseLevel;
      const timestamp = Date.now();

      const baseSuggestions: Suggestion[] = [
        {
          id: `suggestion-${timestamp}-1`,
          text: 'Can you explain that in more detail?',
          type: 'clarification',
        },
        {
          id: `suggestion-${timestamp}-2`,
          text: 'What can you say about the current datapoint?',
          type: 'analysis',
        },
        {
          id: `suggestion-${timestamp}-3`,
          text: 'How does this compare to other data points?',
          type: 'analysis',
        },
      ];

      // Add expertise-specific suggestions
      if (expertise === 'advanced') {
        baseSuggestions.push(
          {
            id: `suggestion-${timestamp}-4`,
            text: 'Can you perform a statistical analysis of this data?',
            type: 'analysis',
          },
          {
            id: `suggestion-${timestamp}-5`,
            text: 'What are the potential outliers in this dataset?',
            type: 'analysis',
          },
        );
      }

      return baseSuggestions;
    } catch (error) {
      console.error('Error generating suggestions:', error);
      return [];
    }
  }

  public updateSuggestions(): void {
    const suggestions = this.generateSuggestions();
    this.store.dispatch(updateSuggestions(suggestions));
  }

  private isValidExpertiseLevel(level: string): level is 'basic' | 'intermediate' | 'advanced' {
    return ['basic', 'intermediate', 'advanced'].includes(level);
  }

  public async sendMessage(newMessage: string): Promise<void> {
    const { llm: llmSettings } = this.snapshot.settings;
    const timestamp = new Date().toISOString();

    this.store.dispatch(addUserMessage({
      text: newMessage,
      timestamp,
    }));

    const enabledModels = (Object.keys(llmSettings.models) as Llm[])
      .filter(model => llmSettings.models[model].enabled && llmSettings.models[model].apiKey.trim().length > 0);
    await Promise.all(enabledModels.map(async (model) => {
      const audioId = this.audioService.playWaitingTone();
      try {
        this.store.dispatch(addPendingResponse({
          model,
          timestamp,
        }));

        const config = llmSettings.models[model];
        const expertise = (llmSettings.customExpertise && ['basic', 'intermediate', 'advanced'].includes(llmSettings.customExpertise))
          ? llmSettings.customExpertise as 'basic' | 'intermediate' | 'advanced'
          : llmSettings.expertiseLevel;
        const response = await this.chatService.sendMessage(model, {
          message: newMessage,
          customInstruction: llmSettings.customInstruction,
          expertise,
          apiKey: config.apiKey,
        });

        this.audioService.stop(audioId);
        if (response.error) {
          this.store.dispatch(updateError({
            model,
            error: response.error,
            timestamp,
          }));
        } else {
          this.store.dispatch(updateResponse({
            model,
            data: response.data!,
            timestamp,
          }));
          this.audioService.playCompleteTone();
          this.updateSuggestions();
        }
      } catch (error) {
        this.audioService.stop(audioId);
        this.store.dispatch(updateError({
          model,
          error: error instanceof Error ? error.message : 'Error processing request',
          timestamp,
        }));
      }
    }));
  }
}

export default chatSlice.reducer;
