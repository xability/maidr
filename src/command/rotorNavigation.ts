import { Context } from '@model/context';
import type { Command } from './command';
import type { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';

export class RotorNavigationNextNavUnitCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;
    private readonly context: Context;
    public constructor(context: Context, rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
        this.context = context;
    }

    public execute(): void {
        this.rotorNavigationViewModel.moveToNextNavUnit();
        const state = this.context.state;
        if (state.type === 'trace') {
            this.rotorNavigationViewModel.toggle(state);
        }
    }
}

export class RotorNavigationPrevNavUnitCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;
    private readonly context: Context;
    public constructor(context: Context, rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
        this.context = context;
    }

    public execute(): void {
        this.rotorNavigationViewModel.moveToPrevNavUnit();
        const state = this.context.state;
        if (state.type === 'trace') {
            this.rotorNavigationViewModel.toggle(state);
        }

    }
}

export class RotorNavigationMoveUpCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;

    public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
    }

    public execute(): void {
        this.rotorNavigationViewModel.moveUp();
        //just noting down: in mode 0, we just change back the toggle out of scope.rotor?
        // in mode 1, move up/ right takes to high value
        // in  mode 3, left/down to lower value
    }
}

export class RotorNavigationMoveLeftCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;

    public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
    }

    public execute(): void {
        this.rotorNavigationViewModel.moveLeft();
    }
}

export class RotorNavigationMoveDownCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;

    public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
    }

    public execute(): void {
        this.rotorNavigationViewModel.moveDown();
    }
}

export class RotorNavigationMoveRightCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;

    public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
    }

    public execute(): void {
        this.rotorNavigationViewModel.moveRight();
    }
}

export class RotorNavigationCloseCommand implements Command {
    private readonly rotorNavigationViewModel: RotorNavigationViewModel;

    public constructor(rotorNavigationViewModel: RotorNavigationViewModel) {
        this.rotorNavigationViewModel = rotorNavigationViewModel;
    }

    public execute(): void {
        this.rotorNavigationViewModel.close();
    }
}