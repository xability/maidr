import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState } from '../store';
import type { ViewModelMap } from '../viewModel/registry';
import { useSelector } from 'react-redux';
import { useMaidrContext } from '../context';

const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

/**
 * Hook to retrieve a view model instance from the current MAIDR context.
 * @param key - The key identifying the view model
 * @returns The view model instance
 */
export function useViewModel<K extends keyof ViewModelMap>(key: K): ViewModelMap[K] {
  const { viewModelRegistry } = useMaidrContext();
  return viewModelRegistry.get(key);
}

// Exclude commandExecutor from ViewModelsWithState since it's not in Redux state
type ViewModelsWithState = Exclude<keyof ViewModelMap, 'commandExecutor'>;

/**
 * Hook to subscribe to a view model's Redux state slice.
 * @param key - The key identifying the view model's state slice
 * @returns The current state for the given key
 */
export function useViewModelState<K extends ViewModelsWithState>(key: K): RootState[K] {
  return useAppSelector(state => state[key]);
}
