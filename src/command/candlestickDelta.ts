import type { CandlestickDeltaService } from '@service/candlestickDelta';
import type { CandlestickDeltaViewModel } from '@state/viewModel/candlestickDeltaViewModel';
import type { Command } from './command';

/**
 * Command bound to F7: opens (or closes) the candlestick reference
 * comparison dialog where the user picks a reference line and OHLC field.
 */
export class ToggleCandlestickDeltaCommand implements Command {
  private readonly candlestickDeltaViewModel: CandlestickDeltaViewModel;

  /**
   * Creates an instance of ToggleCandlestickDeltaCommand.
   * @param {CandlestickDeltaViewModel} candlestickDeltaViewModel - The candlestick delta view model.
   */
  public constructor(candlestickDeltaViewModel: CandlestickDeltaViewModel) {
    this.candlestickDeltaViewModel = candlestickDeltaViewModel;
  }

  /**
   * Toggles the candlestick delta settings dialog.
   */
  public execute(): void {
    this.candlestickDeltaViewModel.toggle();
  }
}

/**
 * Command bound to ESC in the virtual delta layer: deactivates the layer and
 * returns the user to the real chart layer.
 */
export class ExitCandlestickDeltaCommand implements Command {
  private readonly candlestickDeltaService: CandlestickDeltaService;

  /**
   * Creates an instance of ExitCandlestickDeltaCommand.
   * @param {CandlestickDeltaService} candlestickDeltaService - The candlestick delta service.
   */
  public constructor(candlestickDeltaService: CandlestickDeltaService) {
    this.candlestickDeltaService = candlestickDeltaService;
  }

  /**
   * Deactivates the virtual delta layer.
   */
  public execute(): void {
    this.candlestickDeltaService.deactivate();
  }
}
