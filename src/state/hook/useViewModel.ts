import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState } from '../store';
import type { ViewModelMap } from '../viewModel/registry';
import { useSelector } from 'react-redux';
import { ViewModelRegistry } from '../viewModel/registry';

const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export function useViewModel<K extends keyof ViewModelMap>(key: K): ViewModelMap[K] {
  return ViewModelRegistry.instance.get(key);
}

// Exclude commandExecutor from ViewModelsWithState since it's not in Redux state
type ViewModelsWithState = Exclude<keyof ViewModelMap, 'commandExecutor'>;

export function useViewModelState<K extends ViewModelsWithState>(key: K): any {
  return useAppSelector(state => state[key]);
}
