export interface StorageService {
  save: <T>(key: string, value: T) => void;
  load: <T>(key: string) => T | null;
  remove: (key: string) => void;
}

export class LocalStorageService implements StorageService {
  public save<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (error) {
      console.error(`Error while saving ${key} to storage`, error);
    }
  }

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

  public remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error while removing ${key} from storage`, error);
    }
  }
}
