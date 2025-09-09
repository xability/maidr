import type { DisplayService } from '@service/display';
import type { RotorNavigationService } from '@service/rotor';
import type { TextService } from '@service/text';
import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

interface RotorState {
  value: string;
  rotorIndex: number;
}

const initialState: RotorState = {
  value: '',
  rotorIndex: 0,
};
const rotorNavigationSlice = createSlice({
  name: 'rotorNavigation',
  initialState,
  reducers: {
    show(): RotorState {
      return {
        value: '',
        rotorIndex: 0,
      };
    },
  },
});
export class RotorNavigationViewModel extends AbstractViewModel<RotorState> {
  private readonly rotorService: RotorNavigationService;
  private readonly textService: TextService;
  private readonly displayService: DisplayService;

  public constructor(store: AppStore, rotorService: RotorNavigationService, textService: TextService, displayService: DisplayService) {
    super(store);
    this.rotorService = rotorService;
    this.textService = textService;
    this.displayService = displayService;
  }

  public get state(): RotorState {
    return this.store.getState().rotor;
  }

  public toggle(state: TraceState): void {
    this.rotorService.toggle(state);
  }

  public moveToNextNavUnit(): void {
    this.rotorService.moveToNextRotorUnit();
  }

  public moveToPrevNavUnit(): void {
    this.rotorService.moveToPrevRotorUnit();
  }

  public moveUp(): void {
    this.rotorService.moveUp();
  }

  public moveLeft(): void {
    this.rotorService.moveLeft();
  }

  public moveDown(): void {
    this.rotorService.moveDown();
  }

  public moveRight(): void {
    this.rotorService.moveRight();
  }

  public close(): void {
    this.rotorService.close();
  }
}

export default rotorNavigationSlice.reducer;
