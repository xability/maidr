import type { ViewModelMap } from '../viewModel/registry';
import { useAppSelector } from '../hook/useAppSelector';
import { ViewModelRegistry } from '../viewModel/registry';

/**
 * Custom hook to retrieve a view model instance from the registry.
 * @template K - Key type from ViewModelMap
 * @param key - The view model key to retrieve
 * @returns The view model instance associated with the key
 */
export function useViewModel<K extends keyof ViewModelMap>(key: K): ViewModelMap[K] {
  return ViewModelRegistry.instance.get(key);
}

/**
 * Type representing view models that have Redux state, excluding commandExecutor.
 */
// Exclude commandExecutor from ViewModelsWithState since it's not in Redux state
type ViewModelsWithState = Exclude<keyof ViewModelMap, 'commandExecutor'>;

/**
 * Custom hook to retrieve view model state from Redux store.
 * @template K - Key type from ViewModelsWithState
 * @param key - The view model state key to retrieve
 * @returns The state associated with the view model key
 */
export function useViewModelState<K extends ViewModelsWithState>(key: K): any {
  return useAppSelector(state => state[key]);
}
