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

const addUserMessage = createAction<{ text: string; timestamp: string }>('chat/addUserMessage');
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
      .addCase(addUserMessage, (state, action) => {
        state.messages.push({
          id: `msg-${Date.now()}`,
          text: action.payload.text,
          isUser: true,
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

export class ChatViewModel extends AbstractViewModel<ChatState> {
  private readonly chatService: ChatService;
  private readonly audioService: AudioService;

  constructor(store: AppStore, chatService: ChatService, audioService: AudioService) {
    super(store);
    this.chatService = chatService;
    this.audioService = audioService;
  }

  public dispose(): void {
    this.store.dispatch(reset());
  }

  public get state(): ChatState {
    return this.snapshot.chat;
  }

  private get snapshot(): Readonly<RootState> {
    return this.store.getState();
  }

  public toggle(): void {
    this.chatService.toggle();
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
