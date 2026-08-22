import type { TactileService } from '@service/tactile';
import type { Command } from './command';

/**
 * Command to show more detail on the tactile display.
 *
 * A tactile display has far fewer pins than a chart has pixels, so a whole plot
 * scaled onto it can collapse neighbouring marks into the same pin. Zooming
 * spends the same pins on a smaller slice of the chart, which is the only way
 * to tell those marks apart by touch.
 */
export class TactileZoomInCommand implements Command {
  private readonly tactileService: TactileService;

  /**
   * Creates an instance of TactileZoomInCommand.
   * @param tactileService - The service driving the tactile display.
   */
  public constructor(tactileService: TactileService) {
    this.tactileService = tactileService;
  }

  /**
   * Zooms the tactile view in one step.
   */
  public execute(): void {
    this.tactileService.zoomIn();
  }
}

/**
 * Command to show more of the chart on the tactile display, at less detail.
 */
export class TactileZoomOutCommand implements Command {
  private readonly tactileService: TactileService;

  /**
   * Creates an instance of TactileZoomOutCommand.
   * @param tactileService - The service driving the tactile display.
   */
  public constructor(tactileService: TactileService) {
    this.tactileService = tactileService;
  }

  /**
   * Zooms the tactile view out one step.
   */
  public execute(): void {
    this.tactileService.zoomOut();
  }
}
