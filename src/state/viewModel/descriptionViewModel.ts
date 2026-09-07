import type { PayloadAction } from '@reduxjs/toolkit';
import type { DescriptionService } from '@service/description';
import type { DisplayDescriptionState } from '@type/state';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

/**
 * State interface for the chart description modal.
 */
export interface DescriptionMenuState {
  data: DisplayDescriptionState | null;
  /**
   * Zero-based index of the layer tab the keyboard cursor sits on.
   *
   * Distinct from the layer the dialog is describing (`data.layers`' active
   * entry): the tab strip activates manually, so arrowing along it moves this
   * cursor and nothing else until Space confirms the choice. Without the two
   * being separate, every arrow keypress would switch the reader's layer in
   * the chart behind the dialog.
   *
   * -1 when there is nothing to point at — no description open, or a
   * single-layer subplot, which gets no tab strip.
   */
  focusedLayerIndex: number;
}

const initialState: DescriptionMenuState = {
  data: null,
  focusedLayerIndex: -1,
};

/**
 * The layer a description is describing, or -1 when it has no layer tabs.
 * @param data - The description the dialog is showing.
 * @returns The active layer's index.
 */
function activeLayerIndex(data: DisplayDescriptionState | null): number {
  return data?.layers?.find(layer => layer.isActive)?.index ?? -1;
}

const descriptionSlice = createSlice({
  name: 'description',
  initialState,
  reducers: {
    setDescription(state, action: PayloadAction<DisplayDescriptionState | null>): void {
      state.data = action.payload;
      state.focusedLayerIndex = activeLayerIndex(action.payload);
    },
    setFocusedLayer(state, action: PayloadAction<number>): void {
      state.focusedLayerIndex = action.payload;
    },
    reset(): DescriptionMenuState {
      return initialState;
    },
  },
});
const { setDescription, setFocusedLayer, reset } = descriptionSlice.actions;

/**
 * ViewModel for managing the chart description modal state.
 */
export class DescriptionViewModel extends AbstractViewModel<DescriptionMenuState> {
  private readonly descriptionService: DescriptionService;

  public constructor(store: AppStore, descriptionService: DescriptionService) {
    super(store);
    this.descriptionService = descriptionService;
  }

  /**
   * Toggles the description modal, fetching data on open.
   */
  public toggle(): void {
    // only fetch description data when opening the modal, not on close
    const isCurrentlyOpen = this.store.getState().description.data !== null;
    if (!isCurrentlyOpen) {
      const data = this.descriptionService.getDescription();
      // Nothing to describe: don't enter the DESCRIPTION scope, which would
      // otherwise trap the user in an invisible modal (Description renders
      // nothing for null data) recoverable only via Escape.
      if (data === null) {
        return;
      }
      this.store.dispatch(setDescription(data));
    } else {
      this.store.dispatch(setDescription(null));
      // Speak the layer a tab switched to, on the way out and only then, so
      // the reader is told which layer they have landed back on. A no-op when
      // they never touched the tabs.
      this.descriptionService.announcePendingLayerSwitch();
    }
    this.descriptionService.toggle();
  }

  /**
   * Moves the layer tab cursor one step towards the first layer.
   */
  public focusPrevLayer(): void {
    this.moveFocusedLayer(-1);
  }

  /**
   * Moves the layer tab cursor one step towards the last layer.
   */
  public focusNextLayer(): void {
    this.moveFocusedLayer(1);
  }

  /**
   * Steps the layer tab cursor, stopping at the ends of the strip.
   *
   * Clamped rather than wrapped: the strip is short and always on screen, and
   * a cursor that silently jumps from the last layer back to the first costs a
   * reader who cannot see it their place in the list.
   *
   * @param delta - How far to step, in layers.
   */
  private moveFocusedLayer(delta: number): void {
    const { data, focusedLayerIndex } = this.store.getState().description;
    const layers = data?.layers;
    if (!layers || layers.length === 0) {
      return;
    }
    const next = Math.max(0, Math.min(layers.length - 1, focusedLayerIndex + delta));
    if (next !== focusedLayerIndex) {
      this.store.dispatch(setFocusedLayer(next));
    }
  }

  /**
   * Switches the reader to the layer at `index`, moving the tab cursor there
   * first. The click path; the keyboard reaches the same place through
   * {@link selectFocusedLayer}.
   *
   * @param index - Zero-based layer index within the subplot
   */
  public selectLayer(index: number): void {
    this.store.dispatch(setFocusedLayer(index));
    this.selectFocusedLayer();
  }

  /**
   * Switches the reader to the layer the tab cursor is on and re-renders the
   * dialog against it.
   *
   * The switch reaches the model, so leaving the dialog returns the reader to
   * this layer rather than the one they opened it from.
   */
  public selectFocusedLayer(): void {
    const { data, focusedLayerIndex } = this.store.getState().description;
    if (!data?.layers || focusedLayerIndex < 0) {
      return;
    }
    const next = this.descriptionService.selectLayer(focusedLayerIndex);
    if (next !== null) {
      this.store.dispatch(setDescription(next));
    }
  }

  public override dispose(): void {
    super.dispose();
    this.descriptionService.dispose();
    this.store.dispatch(reset());
  }

  public get state(): DescriptionMenuState {
    return this.store.getState().description;
  }
}

export default descriptionSlice.reducer;
