import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState } from '../store';
import { useSelector } from 'react-redux';

/**
 * Type-safe wrapper around react-redux's useSelector hook for the application's RootState.
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
