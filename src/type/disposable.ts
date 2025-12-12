/**
 * Interface for objects that can be disposed to clean up resources or remove event listeners.
 */
export interface Disposable {
  dispose: () => void;
}
