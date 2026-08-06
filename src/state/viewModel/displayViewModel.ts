import type { PayloadAction } from '@reduxjs/toolkit';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { AppStore } from '@state/store';
import type { Focus } from '@type/event';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { Scope } from '@type/event';

/**
 * Focus scopes that render as a dialog — a surface that overlays the chart,
 * traps the keyboard until dismissed, and closes with Escape. Entering one
 * plays the menu open cue and leaving it plays the menu close cue, so every
 * dialog sounds the same as the Go To Extrema modal that first had the cue.
 *
 * `BRAILLE` and `REVIEW` are deliberately absent: they render as an inline
 * text field next to the chart rather than as an overlay, so a dialog cue
 * would describe them wrongly. `CANDLESTICK_DELTA` is plot navigation, not a
 * dialog, and already has its own enter/exit arpeggio.
 */
const DIALOG_SCOPES: ReadonlySet<Focus> = new Set<Focus>([
  Scope.CANDLESTICK_DELTA_SETTINGS,
  Scope.CHAT,
  Scope.COMMAND_PALETTE,
  Scope.DESCRIPTION,
  Scope.GO_TO_EXTREMA,
  Scope.HELP,
  Scope.SETTINGS,
]);

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
   * Plays the shared dialog cue for a focus transition: the open cue when a
   * dialog scope becomes focused, the close cue when the focus leaves one.
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
