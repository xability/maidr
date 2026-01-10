/**
 * Interface for storage operations to persist and retrieve data.
 */
export interface StorageService {
  /**
   * Saves a value to storage with the specified key.
   * @param key - The storage key
   * @param value - The value to store
   */
  save: <T>(key: string, value: T) => void;
  /**
   * Loads a value from storage by key.
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  load: <T>(key: string) => T | null;
  /**
   * Removes a value from storage by key.
   * @param key - The storage key
   */
  remove: (key: string) => void;
}

/**
 * Implementation of StorageService using browser's localStorage API.
 */
export class LocalStorageService implements StorageService {
  /**
   * Saves a value to localStorage by serializing it to JSON.
   * @param key - The storage key
   * @param value - The value to store
   */
  public save<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (error) {
      console.error(`Error while saving ${key} to storage`, error);
    }
  }

  /**
   * Loads a value from localStorage and deserializes it from JSON.
   * @param key - The storage key
   * @returns The stored value or null if not found or on error
   */
  public load<T>(key: string): T | null {
    try {
      const serialized = localStorage.getItem(key);
      if (serialized === null) {
        return null;
      }

      return JSON.parse(serialized) as T;
    } catch (error) {
      console.error(`Error while loading ${key} from storage`, error);
      return null;
    }
  }

  /**
   * Removes a value from localStorage by key.
   * @param key - The storage key
   */
  public remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error while removing ${key} from storage`, error);
    }
  }
}
