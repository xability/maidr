import type { ReadableField } from '@util/readableField';
import type { RefObject } from 'react';
import { useViewModelState } from '@state/hook/useViewModel';
import { keepFieldReadable } from '@util/readableField';
import { useLayoutEffect, useRef } from 'react';

/**
 * Logs an error the field's floor threw. Thrown out of a layout effect, it
 * would unmount the whole chart: the field is left as the floor left it
 * instead, which at worst is as the page drew it.
 * @param action - What the hook was doing
 * @param error - What the floor threw
 */
function reportFailure(action: string, error: unknown): void {
  console.error(`[useReadableField] ${action} failed; the field is left as it is:`, error);
}

/**
 * Keeps one of MAIDR's fields readable on the page it is drawn in (see
 * `keepFieldReadable`), measured before it is painted. The floor checks the
 * field on its own when it gains or loses focus and when the page may have
 * changed its colours; this hook adds the checks only its component knows to
 * ask for.
 *
 * - When high contrast mode or its colours change, after
 *   `HighContrastService` has painted or restored the chart's backdrop: the
 *   service subscribes to the setting before the settings view model does,
 *   and React commits the re-render this hook asks for only after both have
 *   run.
 * - When `step` changes, which catches braille up with a change the floor
 *   does not watch for -- a class on an element between the body and the
 *   chart, say -- on the reader's next step; review takes no steps while it
 *   is open.
 *
 * Like every check, these measure the field only where something the floor
 * reads has changed (see `keepFieldReadable`), and change nothing on the page
 * where nothing has. Whatever the floor throws is logged, never thrown on:
 * keeping the field readable must not cost the reader the chart.
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
    let floor: ReadableField;
    try {
      floor = keepFieldReadable(field);
    } catch (error) {
      reportFailure('Keeping the field readable', error);
      return;
    }
    floorRef.current = floor;
    return () => {
      floorRef.current = null;
      try {
        floor.dispose();
      } catch (error) {
        reportFailure('Disposing of the field\'s floor', error);
      }
    };
  }, [ref]);

  useLayoutEffect(() => {
    try {
      floorRef.current?.check();
    } catch (error) {
      reportFailure('Checking the field\'s colours', error);
    }
  }, [ref, step, highContrastMode, highContrastLightColor, highContrastDarkColor]);
}
