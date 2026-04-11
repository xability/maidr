import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { DescriptionState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';

/**
 * Service for managing the chart description modal.
 * Retrieves objective description data from the active trace on demand.
 */
export class DescriptionService {
  private readonly context: Context;
  private readonly display: DisplayService;

  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;
  }

  /**
   * Gets the description state from the currently active trace.
   * @returns The description state or null if no active trace
   */
  public getDescription(): DescriptionState | null {
    const active = this.context.active;
    if (active instanceof AbstractTrace) {
      const description = active.description;
      // Resolve the best available title. The trace stores layer.title
      // (defaults to 'unavailable') and the figure stores maidr.title
      // (defaults to 'MAIDR Plot'). Prefer the layer title if it was
      // explicitly set, then fall back to the figure title if explicit,
      // otherwise clear it.
      const layerTitle = description.title;
      const figureTitle = this.context.figureTitle;
      const hasLayerTitle = layerTitle && layerTitle !== 'unavailable';
      const hasFigureTitle = figureTitle && figureTitle !== 'MAIDR Plot' && figureTitle !== 'unavailable';
      const title = hasLayerTitle ? layerTitle : hasFigureTitle ? figureTitle : '';
      return { ...description, title };
    }
    return null;
  }

  /**
   * Toggles the visibility of the description modal.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.DESCRIPTION);
  }
}
