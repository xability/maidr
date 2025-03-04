import type { ThunkContext } from '@redux/store';
import type { Llm, Message } from '@type/llm';
import { createAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit';

interface ChatState {
  enabled: boolean;
  messages: Message[];
}

const initialState: ChatState = {
  enabled: false,
  messages: [],
};

export const toggleChat = createAsyncThunk<boolean, void, ThunkContext>(
  'chat/toggle',
  (_, { getState, extra }) => {
    const currentState = getState().chat.enabled;
    return extra().chat.toggle(currentState);
  },
);

export const addUserMessage = createAction<{ text: string; timestamp: string }>('chat/addUserMessage');
export const addPendingResponse = createAction<{ model: Llm; timestamp: string }>('chat/addPendingResponse');
export const updateResponse = createAction<{ model: Llm; data: string; timestamp: string }>('chat/updateResponse');
export const updateError = createAction<{ model: Llm; error: string; timestamp: string }>('chat/updateError');

export const sendMessage = createAsyncThunk<void, string, ThunkContext>(
  'chat/sendMessage',
  async (newMessage, { getState, dispatch, extra }) => {
    const { llm: llmSettings } = getState().settings;
    const chat = extra().chat;
    const audio = extra().audio;
    const timestamp = new Date().toISOString();

    dispatch(addUserMessage({
      text: newMessage,
      timestamp,
    }));

    const enabledModels = (Object.keys(llmSettings.models) as Llm[])
      .filter(model => llmSettings.models[model].enabled);
    await Promise.all(enabledModels.map(async (model) => {
      const audioId = audio.playWaitingTone();
      try {
        dispatch(addPendingResponse({
          model,
          timestamp,
        }));

        const config = llmSettings.models[model];
        const response = await chat.sendMessage(model, {
          message: newMessage,
          customInstruction: llmSettings.customInstruction,
          expertise: llmSettings.customExpertise ?? llmSettings.expertiseLevel,
          apiKey: config.apiKey,
        });

        audio.stop(audioId);
        if (response.error) {
          dispatch(updateError({
            model,
            error: response.error,
            timestamp,
          }));
        } else {
          dispatch(updateResponse({
            model,
            data: response.data!,
            timestamp,
          }));
        }
      } catch (error) {
        audio.stop(audioId);
        dispatch(updateError({
          model,
          error: error instanceof Error ? error.message : 'Error processing request',
          timestamp,
        }));
      }
    }));
  },
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(toggleChat.fulfilled, (state, action) => {
        state.enabled = action.payload;
      })
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

export default chatSlice.reducer;
