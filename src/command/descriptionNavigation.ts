import type { RotorNavigationService } from '@service/rotor';
import type { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';
import type { Command } from './command';

/**
 * Command to move the layer tab cursor towards the first layer in the chart
 * description dialog.
 */
export class DescriptionLayerPrevCommand implements Command {
  private readonly descriptionViewModel: DescriptionViewModel;

  /**
   * Creates an instance of DescriptionLayerPrevCommand.
   * @param {DescriptionViewModel} descriptionViewModel - The description view model.
   */
  public constructor(descriptionViewModel: DescriptionViewModel) {
    this.descriptionViewModel = descriptionViewModel;
  }

  /**
   * Executes the command to move the layer tab cursor backward.
   */
  public execute(): void {
    this.descriptionViewModel.focusPrevLayer();
  }
}

/**
 * Command to move the layer tab cursor towards the last layer in the chart
 * description dialog.
 */
export class DescriptionLayerNextCommand implements Command {
  private readonly descriptionViewModel: DescriptionViewModel;

  /**
   * Creates an instance of DescriptionLayerNextCommand.
   * @param {DescriptionViewModel} descriptionViewModel - The description view model.
   */
  public constructor(descriptionViewModel: DescriptionViewModel) {
    this.descriptionViewModel = descriptionViewModel;
  }

  /**
   * Executes the command to move the layer tab cursor forward.
   */
  public execute(): void {
    this.descriptionViewModel.focusNextLayer();
  }
}

/**
 * Command to switch to the layer the tab cursor is on, re-rendering the
 * description dialog against that layer.
 */
export class DescriptionSelectLayerCommand implements Command {
  private readonly descriptionViewModel: DescriptionViewModel;
  private readonly rotor: RotorNavigationService;

  /**
   * Creates an instance of DescriptionSelectLayerCommand.
   * @param {DescriptionViewModel} descriptionViewModel - The description view model.
   * @param {RotorNavigationService} rotor - The rotor navigation service.
   */
  public constructor(
    descriptionViewModel: DescriptionViewModel,
    rotor: RotorNavigationService,
  ) {
    this.descriptionViewModel = descriptionViewModel;
    this.rotor = rotor;
  }

  /**
   * Selects the layer the tab cursor is on.
   *
   * Space is bound for the whole DESCRIPTION scope, and `KeybindingService`
   * calls `preventDefault` before every command it runs, so a press aimed at
   * one of the dialog's own buttons -- Close, or "Show all rows" -- would
   * otherwise be swallowed on its way to them. Handing such a press back to
   * the button it was aimed at costs a `closest` call and keeps Space working
   * where a reader expects it to.
   *
   * @param event - The keydown that triggered the command, when there was one.
   */
  public execute(event?: Event): void {
    const target = event?.target;
    if (!(target instanceof HTMLElement) || target.closest('[role="tab"]') !== null) {
      // Same reasoning as MoveToNextTraceCommand: a rotor mode is an index on
      // the service but a boolean on the trace, so the rotor is handed back to
      // data mode while the outgoing layer is still active. Otherwise a reader
      // who was in a rotor mode, picked another layer here, and left the dialog
      // would find their arrow keys routed into a mode the new layer never
      // entered.
      this.rotor.resetToDataMode();
      this.descriptionViewModel.selectFocusedLayer();
      return;
    }

    const button = target.closest<HTMLElement>('button, [role="button"]');
    button?.click();
  }
}
