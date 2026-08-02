import type { PayloadAction } from '@reduxjs/toolkit';
import type { AudioService } from '@service/audio';
import type { ChatService } from '@service/chat';
import type { Suggestion } from '@type/chat';
import type { Llm, Message } from '@type/llm';
import type { AppStore, RootState } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { MODEL_VERSIONS } from '@service/modelVersions';
import { getModelDisplayName } from '@util/llm';
import { AbstractViewModel } from './viewModel';

/**
 * Represents the state of the chat interface.
 */
export interface ChatState {
  messages: Message[];
  suggestions: Suggestion[];
}

const initialState: ChatState = {
  messages: [],
  suggestions: [],
};

/**
 * Distinguishes ids minted within the same millisecond.
 *
 * These used to be `Date.now()` alone, which is unique only if no two are
 * created in the same tick — a bound nothing enforces, and one that anything
 * adding two messages programmatically crosses. What made it matter is that
 * #704 derives each message's DOM id scope from its message id, so two
 * messages sharing one share a scope: their footnote ids collide again, and a
 * reference resolves to the first match in document order, which is the other
 * message's note. Everything still renders, so the failure is silent.
 */
let sequence = 0;

/**
 * A unique id for a message or a suggestion.
 *
 * The timestamp is kept for readability and ordering in devtools; the sequence
 * is what actually carries the uniqueness, being monotonic for the life of the
 * page. `kind` leads because `MessageBubble` distinguishes system messages by
 * it (`message.id.startsWith('system-')`).
 * @param kind - The id's leading segment.
 * @returns An id no other call can produce.
 */
function nextId(kind: string): string {
  sequence += 1;
  return `${kind}-${Date.now()}-${sequence}`;
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // The three that add a message mint its id in `prepare` rather than in the
    // reducer. `rules/viewmodel.md` asks reducers to assign the payload and
    // nothing more, and an id is the one thing here that cannot come from the
    // caller — so it is generated where Redux Toolkit puts non-determinism,
    // leaving each reducer pure. The action creators' signatures are unchanged.
    addUserMessage: {
      reducer: (state, action: PayloadAction<{ id: string; text: string; timestamp: string }>) => {
        state.messages.push({
          id: action.payload.id,
          text: action.payload.text,
          isUser: true,
          timestamp: action.payload.timestamp,
          status: 'SUCCESS',
        });
      },
      prepare: (message: { text: string; timestamp: string }) => ({
        payload: { ...message, id: nextId('msg') },
      }),
    },
    addSystemMessage: {
      reducer: (state, action: PayloadAction<{ id: string; text: string; timestamp: string; modelSelections?: { modelKey: Llm; name: string; version: string }[]; isWelcomeMessage?: boolean }>) => {
        state.messages.push({
          id: action.payload.id,
          text: action.payload.text,
          isUser: false,
          timestamp: action.payload.timestamp,
          status: 'SUCCESS',
          modelSelections: action.payload.modelSelections,
          isWelcomeMessage: action.payload.isWelcomeMessage,
        });
      },
      prepare: (message: { text: string; timestamp: string; modelSelections?: { modelKey: Llm; name: string; version: string }[]; isWelcomeMessage?: boolean }) => ({
        payload: { ...message, id: nextId('system') },
      }),
    },
    addPendingResponse: {
      reducer: (state, action: PayloadAction<{ id: string; model: Llm; timestamp: string }>) => {
        state.messages.push({
          id: action.payload.id,
          text: 'Processing request...',
          isUser: false,
          model: action.payload.model,
          timestamp: action.payload.timestamp,
          status: 'PENDING',
        });
      },
      // The model stays in the id, where it has always been, because it is what
      // makes a pending response identifiable in devtools.
      prepare: (response: { model: Llm; timestamp: string }) => ({
        payload: { ...response, id: `${nextId('resp')}-${response.model}` },
      }),
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

/**
 * The slice's action creators.
 *
 * Exported because the three that add a message mint the id in `prepare`, so
 * dispatching those by action type — which is how the other view model tests
 * reach their reducers — skips the only step that generates one. A test of the
 * ids has to go through the creators.
 */
export const chatActions = chatSlice.actions;

/**
 * View model for managing chat interface state and AI model interactions.
 */
export class ChatViewModel extends AbstractViewModel<ChatState> {
  private readonly chatService: ChatService;
  private readonly audioService: AudioService;

  /**
   * Creates a new ChatViewModel instance and loads the initial welcome message.
   * @param {AppStore} store - The Redux store instance.
   * @param {ChatService} chatService - The chat service for managing AI interactions.
   * @param {AudioService} audioService - The audio service for feedback sounds.
   */
  constructor(store: AppStore, chatService: ChatService, audioService: AudioService) {
    super(store);
    this.chatService = chatService;
    this.audioService = audioService;
    this.loadInitialMessage();
  }

  /**
   * Disposes the view model and resets chat state to initial values.
   */
  public override dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  /**
   * Gets the current chat state from the store.
   * @returns {ChatState} The current chat state.
   */
  public get state(): ChatState {
    return this.snapshot.chat;
  }

  /**
   * Gets a read-only snapshot of the entire Redux store state.
   * @returns {Readonly<RootState>} The current root state snapshot.
   */
  private get snapshot(): Readonly<RootState> {
    return this.store.getState();
  }

  /**
   * Checks if the user can send messages based on enabled models with valid API keys.
   * @returns {boolean} True if at least one model is enabled with an API key.
   */
  public get canSend(): boolean {
    const { llm } = this.snapshot.settings;
    return Object.values(llm.models).some(model => model.enabled && model.apiKey.trim().length > 0);
  }

  /**
   * Toggles the visibility of the chat interface.
   */
  public toggle(): void {
    this.chatService.toggle();
  }

  /**
   * Retrieves data about enabled AI models including display names and versions.
   * @returns {{ enabledModels: string[]; modelSelections: { modelKey: Llm; name: string; version: string }[] }} Enabled models data.
   */
  private getEnabledModelsData(): { enabledModels: string[]; modelSelections: { modelKey: Llm; name: string; version: string }[] } {
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

    return { enabledModels, modelSelections };
  }

  /**
   * Loads the initial welcome message displaying available AI models.
   */
  public loadInitialMessage(): void {
    const timestamp = new Date().toISOString();
    const { enabledModels, modelSelections } = this.getEnabledModelsData();

    const text = enabledModels.length > 0
      ? `Welcome to the Chart Assistant. You can select and switch between different AI models using the dropdowns below. Currently enabled: ${enabledModels.join(', ')}.`
      : 'No agents are enabled. Please enable at least one agent and provide an API key (or a local Ollama server) in the settings page.';

    this.store.dispatch(addSystemMessage({
      text,
      timestamp,
      modelSelections,
      isWelcomeMessage: true,
    }));
  }

  /**
   * Clears all chat messages and reloads the initial welcome message.
   */
  public refreshInitialMessage(): void {
    // Clear existing messages and reload initial message
    this.store.dispatch(reset());
    this.loadInitialMessage();
  }

  /**
   * Updates the welcome message with current enabled model information.
   */
  public updateWelcomeMessage(): void {
    const { enabledModels, modelSelections } = this.getEnabledModelsData();

    const text = enabledModels.length > 0
      ? `Welcome to the Chart Assistant. You can select and switch between different AI models using the dropdowns below. Currently enabled: ${enabledModels.join(', ')}.`
      : 'No agents are enabled. Please enable at least one agent and provide an API key (or a local Ollama server) in the settings page.';

    this.store.dispatch(updateWelcomeMessage({
      text,
      modelSelections,
    }));
  }

  /**
   * Generates contextual chat suggestions based on expertise level and last message.
   * @returns {Suggestion[]} Array of suggested follow-up questions.
   */
  private generateSuggestions(): Suggestion[] {
    try {
      const lastMessage = this.state.messages[this.state.messages.length - 1];
      if (!lastMessage || lastMessage.isUser)
        return [];

      const { llm } = this.snapshot.settings;
      const expertise = llm.expertiseLevel;
      const baseSuggestions: Suggestion[] = [
        {
          id: nextId('suggestion'),
          text: 'Can you explain that in more detail?',
          type: 'clarification',
        },
        {
          id: nextId('suggestion'),
          text: 'What can you say about the current datapoint?',
          type: 'analysis',
        },
        {
          id: nextId('suggestion'),
          text: 'How does this compare to other data points?',
          type: 'analysis',
        },
      ];

      // Add expertise-specific suggestions
      if (expertise === 'advanced') {
        baseSuggestions.push(
          {
            id: nextId('suggestion'),
            text: 'Can you perform a statistical analysis of this data?',
            type: 'analysis',
          },
          {
            id: nextId('suggestion'),
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

  /**
   * Generates and updates chat suggestions in the store.
   */
  public updateSuggestions(): void {
    const suggestions = this.generateSuggestions();
    this.store.dispatch(updateSuggestions(suggestions));
  }

  /**
   * Validates if a string is a valid expertise level.
   * @param {string} level - The expertise level to validate.
   * @returns {boolean} True if the level is valid.
   */
  private isValidExpertiseLevel(level: string): level is 'basic' | 'intermediate' | 'advanced' {
    return ['basic', 'intermediate', 'advanced'].includes(level);
  }

  /**
   * Sends a user message to all enabled AI models and handles responses.
   * @param {string} newMessage - The message text to send.
   * @returns {Promise<void>} Promise that resolves when all responses are received.
   */
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
          version: config.version,
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
