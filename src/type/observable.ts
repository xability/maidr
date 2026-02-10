/**
 * Observer that receives state updates from an observable subject.
 */
export interface Observer<T> {
  update: (state: T) => void;
}

/**
 * Observable subject that manages observers and notifies them of state changes.
 */
export interface Observable<T> {
  addObserver: (observer: Observer<T>) => void;
  removeObserver: (observer: Observer<T>) => void;
  notifyStateUpdate: () => void;
  get state(): T;
}
