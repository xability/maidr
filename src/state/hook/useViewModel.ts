import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState } from '../store';
import type { ViewModelMap } from '../viewModel/registry';
import { useSelector } from 'react-redux';
import { ViewModelRegistry } from '../viewModel/registry';

const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export function useViewModel<K extends keyof ViewModelMap>(key: K): ViewModelMap[K] {
  return ViewModelRegistry.instance.get(key);
}

export function useViewModelState<K extends keyof ViewModelMap>(key: K): ViewModelMap[K]['state'] {
  return useAppSelector(state => state[key]);
}
