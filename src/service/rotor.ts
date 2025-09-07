import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { TraceState } from '@type/state';
import type { Event } from '@type/event';
import { Emitter, Scope } from '@type/event';
import { TextService } from './text';

const NO_OF_NAV_UNITS = 3;

export enum RotorEvent {
    ROTOR_CHANGED = 'ROTOR_CHANGED',
    NAV_TARGET_NOT_FOUND = 'NAV_TARGET_NOT_FOUND',
}
enum ROTOR_MODES {
    'DATA_MODE' = 0,
    'HIGHER_VALUE_MODE' = 1,
    'LOWER_VALUE_MODE' = 2
}

interface RotorChangedEvent {
    value: RotorEvent;
}

export class RotorNavigationService {
    private readonly context: Context;
    private readonly display: DisplayService;
    private readonly text: TextService;
    private rotorIndex: number;
    private readonly onChangeEmitter: Emitter<RotorChangedEvent>;
    public readonly onChange: Event<RotorChangedEvent>;

    public constructor(context: Context, display: DisplayService, text: TextService) {
        this.context = context;
        this.display = display;
        this.text = text;
        this.rotorIndex = 0;
        console.log("rotor", this.rotorIndex);
        this.onChangeEmitter = new Emitter<RotorChangedEvent>();
        this.onChange = this.onChangeEmitter.event;
    }

    public toggle(state: TraceState): void {
        if (state.empty) {
            return;
        }

        const activeTrace = this.context.active;
        if (activeTrace) {
            console.log("scope moved to rotor");
            this.display.toggleFocus(Scope.ROTOR);
        }
    }

    public returnToTraceScope(): void {
        this.display.toggleFocus(Scope.ROTOR);
    }
    public moveToNextRotorUnit(): void {
        this.rotorIndex = (this.rotorIndex + 1) % NO_OF_NAV_UNITS;
        this.onChangeEmitter.fire({
            value: RotorEvent.ROTOR_CHANGED,
        });
        console.log(this.rotorIndex);
    }
    public moveToPrevRotorUnit(): void {
        this.rotorIndex = (this.rotorIndex - 1 + NO_OF_NAV_UNITS) % NO_OF_NAV_UNITS;
        this.onChangeEmitter.fire({
            value: RotorEvent.ROTOR_CHANGED,
        });
        console.log(this.rotorIndex);
    }
    public getCurrentUnit(): number {
        return this.rotorIndex;
    }
    public moveUp(): void {
        console.log("let's just move up");
    }
    public moveLeft(): void {
        console.log("let's just move up");
    }
    public moveRight(): void {
        console.log("let's just move up");
    }
    public moveDown(): void {
        console.log("let's just move up");
    }
    public setMode() {
        let curr_mode = ROTOR_MODES[this.rotorIndex];
        this.text.format(curr_mode);

    }
}
