import type { PayloadAction } from '@reduxjs/toolkit';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { AppStore } from '@state/store';
import type { Focus } from '@type/event';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { DIALOG_SCOPES } from '@type/event';

/**
 * Represents the state of a tooltip UI element.
 */
export interface TooltipState {
  visible: boolean;
  value: string;
}

/**
 * Represents the state of display UI elements including focus and tooltips.
 */
export interface DisplayState {
  focus: Focus | null;
  tooltip: TooltipState;
}

const initialState: DisplayState = {
  focus: null,
  tooltip: {
    visible: false,
    value: '',
  },
};

const displaySlice = createSlice({
  name: 'display',
  initialState,
  reducers: {
    hideTooltip(state): void {
      state.tooltip = { ...state.tooltip, visible: false, value: '' };
    },
    showTooltip(state, action: PayloadAction<string>): void {
      state.tooltip = { ...state.tooltip, visible: true, value: action.payload };
    },
    updateFocus(state, action: PayloadAction<Focus>): void {
      state.focus = action.payload;
    },
    clearFocus(state): void {
      state.focus = null;
    },
  },
});
const { hideTooltip, showTooltip, updateFocus, clearFocus } = displaySlice.actions;

/**
 * View model for managing display UI state including focus and tooltips.
 */
export class DisplayViewModel extends AbstractViewModel<DisplayState> {
  private readonly displayService: DisplayService;
  private readonly audioService: AudioService;

  /**
   * The scope the last focus event reported, used to tell an open transition
   * from a close one. Starts as `null` so the first event of a focus session —
   * always the plot's own navigation scope — is silent.
   */
  private previousFocus: Focus | null = null;

  /**
   * Creates a new DisplayViewModel instance and initializes display listeners.
   * @param {AppStore} store - The Redux store instance.
   * @param {DisplayService} displayService - The display service for managing UI elements.
   * @param {AudioService} audioService - The audio service that plays the dialog open/close cues.
   */
  public constructor(store: AppStore, displayService: DisplayService, audioService: AudioService) {
    super(store);

    this.displayService = displayService;
    this.audioService = audioService;

    this.registerListeners();

    this.store.dispatch(hideTooltip());
  }

  /**
   * Disposes the view model, clears focus, and restores instruction tooltip.
   */
  public override dispose(): void {
    // Clear only focus to avoid wiping other display UI state
    this.store.dispatch(clearFocus());
    this.store.dispatch(showTooltip(this.displayService.getInstruction()));
    super.dispose();
  }

  /**
   * Registers listeners to handle display service focus change events.
   */
  private registerListeners(): void {
    this.disposables.push(this.displayService.onChange((e) => {
      this.playDialogCue(e.value);
      this.store.dispatch(updateFocus(e.value));
    }));
  }

  /**
   * Plays the shared dialog cue for a focus transition. The cue describes the
   * scope being entered, so it is the open cue whenever a dialog scope takes
   * focus, and the close cue only when the focus leaves a dialog for a scope
   * that is not one. Moving straight from one dialog to another therefore
   * sounds a single open cue rather than a close followed by an open; no
   * shortcut reaches a second dialog from inside the first today, so that is a
   * rule for the case rather than a description of one that occurs.
   *
   * Every dialog opens and closes by routing through
   * {@link DisplayService.toggleFocus}, so keying the cue off the focus
   * transition covers each dismissal path — Escape, the close button, the
   * backdrop, re-pressing the shortcut, or choosing an entry — without each
   * dialog having to remember to play it.
   *
   * Focus-out stays silent: disposal clears the focus without emitting a
   * change, so a dialog left open when the chart loses focus makes no sound.
   * @param {Focus} focus - The scope the focus just moved to.
   */
  private playDialogCue(focus: Focus): void {
    const previous = this.previousFocus;
    this.previousFocus = focus;
    if (previous === focus) {
      return;
    }

    if (DIALOG_SCOPES.has(focus)) {
      this.audioService.playMenuOpenTone();
    } else if (previous !== null && DIALOG_SCOPES.has(previous)) {
      this.audioService.playMenuCloseTone();
    }
  }

  /**
   * Gets the current display state from the store.
   * @returns {DisplayState} The current display state.
   */
  public get state(): DisplayState {
    return this.store.getState().display;
  }
}

export default displaySlice.reducer;
