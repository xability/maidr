import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { NotificationService } from '@service/notification';
import type { ObjectListViewModel } from '@state/viewModel/objectListViewModel';
import type { Command } from './command';
import { t } from '@util/i18n';

/**
 * Opens the object list on a chart without axes, or closes it.
 */
export class ObjectListToggleCommand implements Command {
  private readonly objectListViewModel: ObjectListViewModel;
  private readonly notificationService: NotificationService;
  private readonly audioService: AudioService;
  private readonly autoplayService: AutoplayService;

  /**
   * Creates an instance of ObjectListToggleCommand.
   * @param objectListViewModel - The object list view model
   * @param notificationService - For saying why a chart has no list
   * @param audioService - For the warning tone that goes with it
   * @param autoplayService - Stopped before the list opens
   */
  public constructor(
    objectListViewModel: ObjectListViewModel,
    notificationService: NotificationService,
    audioService: AudioService,
    autoplayService: AutoplayService,
  ) {
    this.objectListViewModel = objectListViewModel;
    this.notificationService = notificationService;
    this.audioService = audioService;
    this.autoplayService = autoplayService;
  }

  /**
   * Opens the list, or closes it when it is open.
   *
   * `o` is bound on every chart, so a chart walked along its axes -- which has
   * no list -- says so, with the warning tone the unassigned-key warning the
   * press used to reach would have played. Autoplay stops first: it would
   * otherwise keep moving the cursor under the list, and the row marked as
   * the reader's place would no longer be.
   */
  public execute(): void {
    if (this.objectListViewModel.state.visible) {
      this.objectListViewModel.hide();
      return;
    }
    if (!this.objectListViewModel.isAvailable()) {
      this.notificationService.notify(t('text.noObjectList'));
      this.audioService.playWarningToneIfEnabled();
      return;
    }
    this.autoplayService.stop();
    this.objectListViewModel.open();
  }
}

/** Where a key moves the selection in the object list. */
export type ObjectListMovement = 'up' | 'down' | 'first' | 'last' | 'pageUp' | 'pageDown';

/**
 * Moves the selection in the object list.
 */
export class ObjectListMoveCommand implements Command {
  private readonly objectListViewModel: ObjectListViewModel;
  private readonly movement: ObjectListMovement;

  /**
   * Creates an instance of ObjectListMoveCommand.
   * @param objectListViewModel - The object list view model
   * @param movement - Where the key moves the selection
   */
  public constructor(objectListViewModel: ObjectListViewModel, movement: ObjectListMovement) {
    this.objectListViewModel = objectListViewModel;
    this.movement = movement;
  }

  public execute(): void {
    const viewModel = this.objectListViewModel;
    switch (this.movement) {
      case 'up':
        viewModel.moveUp();
        break;
      case 'down':
        viewModel.moveDown();
        break;
      case 'first':
        viewModel.moveToFirst();
        break;
      case 'last':
        viewModel.moveToLast();
        break;
      case 'pageUp':
        viewModel.pageUp();
        break;
      case 'pageDown':
        viewModel.pageDown();
        break;
    }
  }
}

/**
 * Jumps to the selected object and closes the list.
 */
export class ObjectListSelectCommand implements Command {
  private readonly objectListViewModel: ObjectListViewModel;

  /**
   * Creates an instance of ObjectListSelectCommand.
   * @param objectListViewModel - The object list view model
   */
  public constructor(objectListViewModel: ObjectListViewModel) {
    this.objectListViewModel = objectListViewModel;
  }

  public execute(): void {
    this.objectListViewModel.selectCurrent();
  }
}

/**
 * Closes the object list without moving.
 */
export class ObjectListCloseCommand implements Command {
  private readonly objectListViewModel: ObjectListViewModel;

  /**
   * Creates an instance of ObjectListCloseCommand.
   * @param objectListViewModel - The object list view model
   */
  public constructor(objectListViewModel: ObjectListViewModel) {
    this.objectListViewModel = objectListViewModel;
  }

  public execute(): void {
    this.objectListViewModel.hide();
  }
}

/**
 * Steps to the next or previous order the chart offers.
 */
export class ObjectListSortCommand implements Command {
  private readonly objectListViewModel: ObjectListViewModel;
  private readonly step: 1 | -1;

  /**
   * Creates an instance of ObjectListSortCommand.
   * @param objectListViewModel - The object list view model
   * @param step - 1 for the next order, -1 for the previous
   */
  public constructor(objectListViewModel: ObjectListViewModel, step: 1 | -1) {
    this.objectListViewModel = objectListViewModel;
    this.step = step;
  }

  public execute(): void {
    this.objectListViewModel.cycleSort(this.step);
  }
}

/**
 * Steps to the next or previous filter the chart offers.
 */
export class ObjectListFilterCommand implements Command {
  private readonly objectListViewModel: ObjectListViewModel;
  private readonly step: 1 | -1;

  /**
   * Creates an instance of ObjectListFilterCommand.
   * @param objectListViewModel - The object list view model
   * @param step - 1 for the next filter, -1 for the previous
   */
  public constructor(objectListViewModel: ObjectListViewModel, step: 1 | -1) {
    this.objectListViewModel = objectListViewModel;
    this.step = step;
  }

  public execute(): void {
    this.objectListViewModel.cycleFilter(this.step);
  }
}
