import type { Disposable } from '@type/disposable';
import type { AppStore } from '../store';

export abstract class AbstractViewModel<UiState> implements Disposable {
  protected readonly store: AppStore;
  protected readonly disposables: Disposable[];

  protected constructor(store: AppStore) {
    this.store = store;
    this.disposables = new Array<Disposable>();
  }

  public dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables.length = 0;
  }

  public abstract get state(): UiState;
}
