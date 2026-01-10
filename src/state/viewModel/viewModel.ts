import type { Disposable } from '@type/disposable';
import type { AppStore } from '../store';

/**
 * Abstract base class for view models that manage UI state and store interactions.
 * @template UiState The type of UI state managed by this view model.
 */
export abstract class AbstractViewModel<UiState> implements Disposable {
  protected readonly store: AppStore;
  protected readonly disposables: Disposable[];

  /**
   * Creates a new AbstractViewModel instance.
   * @param {AppStore} store - The Redux store instance for state management.
   */
  protected constructor(store: AppStore) {
    this.store = store;
    this.disposables = new Array<Disposable>();
  }

  /**
   * Disposes all registered disposables and clears the disposables array.
   */
  public dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables.length = 0;
  }

  /**
   * Gets the current UI state managed by this view model.
   * @returns {UiState} The current UI state.
   */
  public abstract get state(): UiState;
}
