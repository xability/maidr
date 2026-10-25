import type { MessageKey } from '@util/i18n';
import { TraceType } from '@type/grammar';
import { t } from '@util/i18n';
import { Platform } from '@util/platform';

/**
 * The id of the element holding a chart's keyboard instructions until it is
 * first focused. `maidr-component.tsx` renders it beside the plot, so the
 * instructions are in the very first render, and points the plot's
 * `aria-describedby` at it.
 *
 * @param chartId - The chart's id, `Maidr.id`
 * @returns The element's id
 */
export function initialInstructionId(chartId: string): string {
  return `maidr-instruction-${chartId}`;
}

/**
 * The id of the element `DisplayService` keeps a chart's instructions in from
 * its first focus on. They follow the reader: a figure re-entered inside one
 * of its subplots is described from there, not from its first panel, and the
 * click prompt goes once the chart is active. The element is the service's
 * own, never React's, so rewriting it cannot fight a render.
 *
 * @param chartId - The chart's id, `Maidr.id`
 * @returns The element's id
 */
export function currentInstructionId(chartId: string): string {
  return `maidr-instruction-${chartId}-current`;
}

/**
 * A chart's instructions, followed by the key that opens the help menu.
 *
 * @param instruction - The instructions for where the reader is
 * @returns The text the chart is described by
 */
export function withKeyboardHelp(instruction: string): string {
  return `${instruction} ${t('model.instructionKeyboardHelp', { modifier: Platform.ctrlSpoken })}`;
}

/**
 * Points an element's `aria-describedby` at one of MAIDR's instruction
 * elements, or at none of them, and leaves every other id where it is.
 *
 * A page can describe the chart too: r-maidr gives it the author's alt text
 * and caption. MAIDR's id goes last, so a reader hears what the chart shows
 * before how to use it.
 *
 * @param element - The plot element
 * @param instructionIds - Every id MAIDR's instructions may be under
 * @param id - The one to describe the element by, or `null` for none
 */
export function describeWithInstruction(
  element: Element,
  instructionIds: readonly string[],
  id: string | null,
): void {
  const ids = (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(token => token !== '' && !instructionIds.includes(token));
  if (id !== null) {
    ids.push(id);
  }
  if (ids.length > 0) {
    element.setAttribute('aria-describedby', ids.join(' '));
  } else {
    element.removeAttribute('aria-describedby');
  }
}

/**
 * The phrase the entry instruction counts a layer's groups with: a line
 * chart's are groups ("with 3 groups"), a contour plot's are its levels
 * ("with 4 levels").
 *
 * @param traceType - The layer's trace type
 * @returns The message key of the count phrase
 */
export function groupCountKey(traceType: TraceType | string): MessageKey {
  return traceType === TraceType.CONTOUR ? 'model.instructionLevelCount' : 'model.instructionGroupCount';
}
