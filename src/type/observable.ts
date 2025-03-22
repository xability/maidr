export interface Observer<T> {
  update: (state: T) => void;
}

export interface Observable<T> {
  addObserver: (observer: Observer<T>) => void;
  removeObserver: (observer: Observer<T>) => void;
  notifyStateUpdate: () => void;
  get state(): T;
}
