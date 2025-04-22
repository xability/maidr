import type { AudioService } from '@service/audio';
import type { ChatService } from '@service/chat';
import type { Llm, Message } from '@type/llm';
import type { AppStore, RootState } from '../store';
import { createAction, createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

interface ChatState {
  enabled: boolean;
  messages: Message[];
}

const initialState: ChatState = {
  enabled: false,
  messages: [],
};

const addMessage = createAction<{ text: string; isUser: boolean; timestamp: string }>('chat/addMessage');
const addPendingResponse = createAction<{ model: Llm; timestamp: string }>('chat/addPendingResponse');
const updateResponse = createAction<{ model: Llm; data: string; timestamp: string }>('chat/updateResponse');
const updateError = createAction<{ model: Llm; error: string; timestamp: string }>('chat/updateError');

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    reset() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(addMessage, (state, action) => {
        state.messages.push({
          id: `${action.payload.isUser ? 'user' : 'sys'}-${Date.now()}`,
          text: action.payload.text,
          isUser: action.payload.isUser,
          timestamp: action.payload.timestamp,
          status: 'SUCCESS',
        });
      })
      .addCase(addPendingResponse, (state, action) => {
        state.messages.push({
          id: `resp-${Date.now()}-${action.payload.model}`,
          text: 'Processing request...',
          isUser: false,
          model: action.payload.model,
          timestamp: action.payload.timestamp,
          status: 'PENDING',
        });
      })
      .addCase(updateResponse, (state, action) => {
        const message = state.messages.find(m =>
          m.model === action.payload.model
          && m.timestamp === action.payload.timestamp,
        );
        if (message) {
          message.text = action.payload.data;
          message.status = 'SUCCESS';
        }
      })
      .addCase(updateError, (state, action) => {
        const message = state.messages.find(m =>
          m.model === action.payload.model
          && m.timestamp === action.payload.timestamp,
        );
        if (message) {
          message.text = `Error: ${action.payload.error}`;
          message.status = 'FAILED';
        }
      });
  },
});

const { reset } = chatSlice.actions;

/**
 * ViewModel responsible for managing chat state and coordinating with ChatService
 */
export class ChatViewModel extends AbstractViewModel<ChatState> {
  private readonly chatService: ChatService;
  private readonly audioService: AudioService;
  constructor(store: AppStore, chatService: ChatService, audioService: AudioService) {
    super(store);
    this.chatService = chatService;
    this.audioService = audioService;
  }

  /**
   * Disposes of the ViewModel resources
   */
  public dispose(): void {
    this.store.dispatch(reset());
  }

  /**
   * Gets the current chat state
   */
  public get state(): ChatState {
    return this.snapshot.chat;
  }

  /**
   * Gets the current application state snapshot
   */
  private get snapshot(): Readonly<RootState> {
    return this.store.getState();
  }

  /**
   * Toggles the chat interface and checks for enabled models
   */
  public toggle(): void {
    this.chatService.toggle();

    // Check for enabled models and show appropriate message when chat is opened
    if (this.state.messages.length === 0) {
      const { llm: llmSettings } = this.snapshot.settings;
      const modelInfo = this.chatService.getEnabledModelsInfo(llmSettings);
      this.addSystemMessage(modelInfo.systemMessage);
    }
  }

  private addMessage(text: string, isUser: boolean = false): void {
    this.store.dispatch(addMessage({
      text,
      isUser,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Adds a system message to the chat
   *
   * @param text - The text content of the system message
   */
  public addSystemMessage(text: string): void {
    this.addMessage(text, false);
  }

  public async sendMessage(newMessage: string): Promise<void> {
    const { llm: llmSettings } = this.snapshot.settings;
    const enabledModels = (Object.keys(llmSettings.models) as Llm[])
      .filter(model => llmSettings.models[model].enabled && llmSettings.models[model].apiKey);

    if (enabledModels.length === 0) {
      this.addMessage('No agents are enabled. Please enable at least one agent in the settings.', false);
      return;
    }

    const timestamp = new Date().toISOString();
    this.addMessage(newMessage, true);

    await Promise.all(enabledModels.map(async (model) => {
      const audioId = this.audioService.playWaitingTone();
      try {
        this.store.dispatch(addPendingResponse({
          model,
          timestamp,
        }));

        const config = llmSettings.models[model];
        const response = await this.chatService.sendMessage(model, {
          message: newMessage,
          customInstruction: llmSettings.customInstruction,
          expertise: llmSettings.customExpertise ?? llmSettings.expertiseLevel,
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
