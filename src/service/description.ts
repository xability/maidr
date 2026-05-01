import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { DescriptionState } from '@type/state';
import { AbstractTrace, DEFAULT_SUBPLOT_TITLE } from '@model/abstract';
import { DEFAULT_FIGURE_TITLE } from '@model/plot';
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
      // Resolve the best available title. Prefer the layer title if it was
      // explicitly set, then fall back to the figure title if explicit,
      // otherwise clear it.
      const layerTitle = description.title;
      const figureTitle = this.context.figureTitle;
      const hasLayerTitle = layerTitle && layerTitle !== DEFAULT_SUBPLOT_TITLE;
      const hasFigureTitle = figureTitle && figureTitle !== DEFAULT_FIGURE_TITLE && figureTitle !== DEFAULT_SUBPLOT_TITLE;
      const title = hasLayerTitle ? layerTitle : hasFigureTitle ? figureTitle : '';

      const subplots = this.context.getSubplotSummaries();
      return {
        ...description,
        title,
        ...(subplots.length > 0 && { subplots }),
      };
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
