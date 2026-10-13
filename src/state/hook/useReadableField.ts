import type { RefObject } from 'react';
import { useViewModelState } from '@state/hook/useViewModel';
import { keepFieldReadable, watchFieldColours } from '@util/readableField';
import { useLayoutEffect, useRef } from 'react';

/** The undo of a floor that changed nothing. */
function nothingToUndo(): void {}

/**
 * Keeps one of MAIDR's fields readable on the page it is drawn in (see
 * `keepFieldReadable`), measured before it is painted.
 *
 * Measured again whenever high contrast mode or its colours change, after
 * `HighContrastService` has painted or restored the chart's backdrop: the
 * service subscribes to the setting before the settings view model does, and
 * React commits the re-render this hook asks for only after both have run.
 * Measured again too whenever `step` changes, so a page that switches its
 * theme while the field is open -- the system's dark mode, or a page script
 * -- is caught up with on the reader's next step, and whenever
 * `watchFieldColours` sees the field's colours may have changed without one.
 * @param ref - The field
 * @param step - The field's state from the store, a new object on every
 *   update its view model dispatches, which is every step the reader takes
 *   (a step can leave the field's text and caret as they were, from the
 *   chart's starting place onto its first point)
 */
export function useReadableField(ref: RefObject<HTMLElement | null>, step: object): void {
  const { general } = useViewModelState('settings');
  const { highContrastMode, highContrastLightColor, highContrastDarkColor } = general;
  // The undo of the floor in place, whichever measure put it there.
  const undoRef = useRef<() => void>(nothingToUndo);

  useLayoutEffect(() => {
    const field = ref.current;
    if (field === null) {
      return;
    }
    undoRef.current = keepFieldReadable(field);
    return () => {
      undoRef.current();
      undoRef.current = nothingToUndo;
    };
  }, [ref, step, highContrastMode, highContrastLightColor, highContrastDarkColor]);

  // A layout effect, so it listens before Braille focuses its field.
  useLayoutEffect(() => {
    const field = ref.current;
    if (field === null) {
      return;
    }
    return watchFieldColours(field, () => {
      undoRef.current();
      undoRef.current = keepFieldReadable(field);
    });
  }, [ref]);
}
