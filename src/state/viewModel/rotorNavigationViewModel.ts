import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { RotorNavigationService } from '@service/rotor';
import { TextService } from '@service/text';
import { DisplayService } from '@service/display';
import { createSlice } from '@reduxjs/toolkit';

interface RotorState {
    value: string;
    rotorIndex: number;
}

const initialState: RotorState = {
    value: '',
    rotorIndex: 0
};
const rotorNavigationSlice = createSlice({
    name: 'rotorNavigation',
    initialState,
    reducers: {
        show(state, action): RotorState {
            return {
                value: '',
                rotorIndex: 0
            };
        }
    },
});
const { show } = rotorNavigationSlice.actions;
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
        console.log("view model toggle");
        this.rotorService.toggle(state);
    }

    public moveToNextNavUnit(): void {
        this.rotorService.moveToNextRotorUnit();
    }
    public moveToPrevNavUnit(): void {
        this.rotorService.moveToPrevRotorUnit();
    }
    public moveUp(): void {
        console.log("move up");
        this.rotorService.moveUp();
    }
    public moveLeft(): void {
        console.log("move left");
    }
    public moveDown(): void {
        console.log("move down");
    }
    public moveRight(): void {
        console.log("move right");
    }
}

export default rotorNavigationSlice.reducer;

