import type { Command } from './command';
import type { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';

export class RotorNavigationNextNavUnitCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;

    public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
    }

    public execute(): void {
        this.rotorNavigationViewModel.moveToNextNavUnit();
    }
}

export class RotorNavigationPrevNavUnitCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;

    public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
    }

    public execute(): void {
        this.rotorNavigationViewModel.moveToPrevNavUnit();
    }
}