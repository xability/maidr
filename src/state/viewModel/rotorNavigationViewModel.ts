import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { RotorNavigationService } from '@service/rotor';
import { TextService } from '@service/text';
import { DisplayService } from '@service/display';

interface RotorState {
    value: string;
}

const initialState: RotorState = {
    value: '',
};

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
        return this.store.getState().review;
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
}


