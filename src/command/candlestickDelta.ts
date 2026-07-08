import type { CandlestickDeltaService } from '@service/candlestickDelta';
import type { CandlestickDeltaViewModel } from '@state/viewModel/candlestickDeltaViewModel';
import type { Command } from './command';

/**
 * Command bound to Alt+L: toggles the virtual candlestick delta layer on or
 * off using the remembered reference line. With no reference chosen yet it
 * warns and opens the reference picker.
 */
export class ToggleCandlestickDeltaLayerCommand implements Command {
  private readonly candlestickDeltaViewModel: CandlestickDeltaViewModel;

  public constructor(candlestickDeltaViewModel: CandlestickDeltaViewModel) {
    this.candlestickDeltaViewModel = candlestickDeltaViewModel;
  }

  public execute(): void {
    this.candlestickDeltaViewModel.toggleLayer();
  }
}

/**
 * Command bound to Ctrl+Shift+L: opens the reference picker so the user can
 * choose (or change) the moving-average line to compare against.
 */
export class SelectCandlestickDeltaReferenceCommand implements Command {
  private readonly candlestickDeltaViewModel: CandlestickDeltaViewModel;

  public constructor(candlestickDeltaViewModel: CandlestickDeltaViewModel) {
    this.candlestickDeltaViewModel = candlestickDeltaViewModel;
  }

  public execute(): void {
    this.candlestickDeltaViewModel.openReferencePicker();
  }
}

/** Moves the reference-picker selection up one option. */
export class CandlestickDeltaRefMoveUpCommand implements Command {
  private readonly candlestickDeltaViewModel: CandlestickDeltaViewModel;

  public constructor(candlestickDeltaViewModel: CandlestickDeltaViewModel) {
    this.candlestickDeltaViewModel = candlestickDeltaViewModel;
  }

  public execute(): void {
    this.candlestickDeltaViewModel.moveSelectionUp();
  }
}

/** Moves the reference-picker selection down one option. */
export class CandlestickDeltaRefMoveDownCommand implements Command {
  private readonly candlestickDeltaViewModel: CandlestickDeltaViewModel;

  public constructor(candlestickDeltaViewModel: CandlestickDeltaViewModel) {
    this.candlestickDeltaViewModel = candlestickDeltaViewModel;
  }

  public execute(): void {
    this.candlestickDeltaViewModel.moveSelectionDown();
  }
}

/** Confirms the highlighted reference line and activates the comparison. */
export class CandlestickDeltaRefSelectCommand implements Command {
  private readonly candlestickDeltaViewModel: CandlestickDeltaViewModel;

  public constructor(candlestickDeltaViewModel: CandlestickDeltaViewModel) {
    this.candlestickDeltaViewModel = candlestickDeltaViewModel;
  }

  public execute(): void {
    this.candlestickDeltaViewModel.confirmSelection();
  }
}

/** Closes the reference picker without changing the remembered reference. */
export class CandlestickDeltaRefCloseCommand implements Command {
  private readonly candlestickDeltaViewModel: CandlestickDeltaViewModel;

  public constructor(candlestickDeltaViewModel: CandlestickDeltaViewModel) {
    this.candlestickDeltaViewModel = candlestickDeltaViewModel;
  }

  public execute(): void {
    this.candlestickDeltaViewModel.cancel();
  }
}

/**
 * Command bound to ESC in the virtual delta layer: deactivates the layer and
 * returns the user to the real chart layer.
 */
export class ExitCandlestickDeltaCommand implements Command {
  private readonly candlestickDeltaService: CandlestickDeltaService;

  public constructor(candlestickDeltaService: CandlestickDeltaService) {
    this.candlestickDeltaService = candlestickDeltaService;
  }

  public execute(): void {
    this.candlestickDeltaService.deactivate();
  }
}
