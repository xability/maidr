import type { Disposable } from '@type/disposable';
import type { AppStore } from '../store';

export abstract class AbstractViewModel<UiState> implements Disposable {
  protected readonly store: AppStore;

  protected constructor(store: AppStore) {
    this.store = store;
  }

  public abstract dispose(): void;
  public abstract get state(): UiState;
}
