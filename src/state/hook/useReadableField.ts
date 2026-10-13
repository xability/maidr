import type { ReadableField } from '@util/readableField';
import type { RefObject } from 'react';
import { useViewModelState } from '@state/hook/useViewModel';
import { keepFieldReadable } from '@util/readableField';
import { useLayoutEffect, useRef } from 'react';

/**
 * Keeps one of MAIDR's fields readable on the page it is drawn in (see
 * `keepFieldReadable`, which also checks it again whenever the page may have
 * changed its colours), measured before it is painted.
 *
 * Checked again whenever high contrast mode or its colours change, after
 * `HighContrastService` has painted or restored the chart's backdrop: the
 * service subscribes to the setting before the settings view model does, and
 * React commits the re-render this hook asks for only after both have run.
 * And checked again whenever `step` changes, which catches braille up with a
 * theme switched in a way the floor does not watch on the reader's next
 * step; review takes no steps while it is open. A check that finds nothing
 * changed changes nothing on the page.
 * @param ref - The field
 * @param step - The field's state from the store, a new object on every
 *   update its view model dispatches, which is every step the reader takes
 *   (a step can leave the field's text and caret as they were, from the
 *   chart's starting place onto its first point)
 */
export function useReadableField(ref: RefObject<HTMLElement | null>, step: object): void {
  const { general } = useViewModelState('settings');
  const { highContrastMode, highContrastLightColor, highContrastDarkColor } = general;
  const floorRef = useRef<ReadableField | null>(null);

  // A layout effect, so it listens before Braille focuses its field.
  useLayoutEffect(() => {
    const field = ref.current;
    if (field === null) {
      return;
    }
    const floor = keepFieldReadable(field);
    floorRef.current = floor;
    return () => {
      floor.dispose();
      floorRef.current = null;
    };
  }, [ref]);

  useLayoutEffect(() => {
    floorRef.current?.check();
  }, [ref, step, highContrastMode, highContrastLightColor, highContrastDarkColor]);
}
