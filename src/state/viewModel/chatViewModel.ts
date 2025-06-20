import type { PayloadAction } from '@reduxjs/toolkit';
import type { AudioService } from '@service/audio';
import type { ChatService } from '@service/chat';
import type { Llm, Message } from '@type/llm';
import type { AppStore, RootState } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

interface ChatState {
  messages: Message[];
}

const initialState: ChatState = {
  messages: [],
};

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
    addSystemMessage: (state, action: PayloadAction<{ text: string; timestamp: string }>) => {
      state.messages.push({
        id: `system-${Date.now()}`,
        text: action.payload.text,
        isUser: false,
        timestamp: action.payload.timestamp,
        status: 'SUCCESS',
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
    reset() {
      return initialState;
    },
  },
});
const { addUserMessage, addSystemMessage, addPendingResponse, updateResponse, updateError, reset } = chatSlice.actions;

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
    return Object.values(llm.models).some(model => model.enabled);
  }

  public toggle(): void {
    this.chatService.toggle();
  }

  private loadInitialMessage(): void {
    const timestamp = new Date().toISOString();
    const text = this.canSend
      ? 'Welcome to the Chart Assistant. You can ask questions about the chart and get AI-powered responses.'
      : 'No agents are enabled. Please enable at least one agent in the settings page.';

    this.store.dispatch(addSystemMessage({ text, timestamp }));
  }

  public async sendMessage(newMessage: string): Promise<void> {
    const { llm: llmSettings } = this.snapshot.settings;
    const timestamp = new Date().toISOString();

    this.store.dispatch(addUserMessage({
      text: newMessage,
      timestamp,
    }));

    const enabledModels = (Object.keys(llmSettings.models) as Llm[])
      .filter(model => llmSettings.models[model].enabled);
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
          expertise: llmSettings.expertiseLevel,
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
