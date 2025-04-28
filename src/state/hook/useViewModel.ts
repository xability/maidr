import type { ViewModelMap } from '../viewModel/registry';
import { useAppSelector } from '../hook/useAppSelector';
import { ViewModelRegistry } from '../viewModel/registry';

export function useViewModel<K extends keyof ViewModelMap>(key: K): ViewModelMap[K] {
  return ViewModelRegistry.instance.get(key);
}

export function useViewModelState<K extends keyof ViewModelMap>(key: K): ViewModelMap[K]['state'] {
  return useAppSelector(state => state[key]);
}
