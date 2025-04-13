import type { PayloadAction } from '@reduxjs/toolkit';
import type { AudioService } from '@service/audio';
import type { ChatService } from '@service/chat';
import type { Llm, Message } from '@type/llm';
import type { AppStore, RootState } from '../store';
import { createAction, createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

interface ChatState {
  enabled: boolean;
  messages: Message[];
}

const initialState: ChatState = {
  enabled: false,
  messages: [],
};

const addUserMessage = createAction<{ text: string; timestamp: string }>('chat/addUserMessage');
const addSystemMessage = createAction<{ text: string; timestamp: string }>('chat/addSystemMessage');
const addPendingResponse = createAction<{ model: Llm; timestamp: string }>('chat/addPendingResponse');
const updateResponse = createAction<{ model: Llm; data: string; timestamp: string }>('chat/updateResponse');
const updateError = createAction<{ model: Llm; error: string; timestamp: string }>('chat/updateError');

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    toggle(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
    },
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
      .addCase(addSystemMessage, (state, action) => {
        state.messages.push({
          id: `sys-${Date.now()}`,
          text: action.payload.text,
          isUser: false,
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
const { toggle } = chatSlice.actions;

export class ChatViewModel extends AbstractViewModel<ChatState> {
  private readonly chatService: ChatService;
  private readonly audioService: AudioService;

  public constructor(store: AppStore, chatService: ChatService, audioService: AudioService) {
    super(store);
    this.chatService = chatService;
    this.audioService = audioService;
  }

  public get state(): ChatState {
    return this.store.getState().chat;
  }

  private get settings(): RootState['settings'] {
    return this.store.getState().settings;
  }

  public toggle(): void {
    this.store.dispatch(toggle(!this.state.enabled));
  }

  public addMessage(text: string, isUser: boolean = false, _model?: Llm): void {
    const timestamp = new Date().toISOString();
    if (isUser) {
      this.store.dispatch(addUserMessage({ text, timestamp }));
    } else {
      this.store.dispatch(addSystemMessage({ text, timestamp }));
    }
  }

  public async sendMessage(text: string): Promise<void> {
    const enabledModel = Object.entries(this.settings.llm.models).find(([_, model]) =>
      model.enabled && model.apiKey,
    );

    if (!enabledModel) {
      this.addMessage('No agents are enabled. Please enable at least one agent in the settings page.');
      return;
    }

    const [model, config] = enabledModel;
    this.addMessage(text, true);

    try {
      await this.chatService.sendMessage(text, model as Llm, config.apiKey);
    } catch (error) {
      if (error instanceof Error && error.message.includes('authentication')) {
        this.addMessage('The API key is not authenticated. Please check your API key in the settings page.');
      } else {
        this.addMessage('Error sending message. Please try again.');
      }
    }
  }
}

export default chatSlice.reducer;
