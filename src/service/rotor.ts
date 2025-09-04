import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { TraceState } from '@type/state';
import type { Event } from '@type/event';
import { Emitter, Scope } from '@type/event';

const NO_OF_NAV_UNITS = 3;

export enum RotorEvent {
    ROTOR_CHANGED = 'ROTOR_CHANGED',
    NAV_TARGET_NOT_FOUND = 'NAV_TARGET_NOT_FOUND',
}
interface RotorChangedEvent {
    value: RotorEvent;
}

export class RotorNavigationService {
    private readonly context: Context;
    private readonly display: DisplayService;
    private rotorIndex: number;
    private readonly onChangeEmitter: Emitter<RotorChangedEvent>;
    public readonly onChange: Event<RotorChangedEvent>;

    public constructor(context: Context, display: DisplayService) {
        this.context = context;
        this.display = display;
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
            this.display.toggleFocus(Scope.ROTOR);
        }
    }

    public returnToTraceScope(): void {
        this.display.toggleFocus(Scope.GO_TO_EXTREMA);
    }
    public moveToNextRotorUnit(): void {
        this.rotorIndex = (this.rotorIndex + 1) % NO_OF_NAV_UNITS;
        this.onChangeEmitter.fire({
            value: RotorEvent.ROTOR_CHANGED,
        });
        console.log(this.rotorIndex);
    }
    public moveToPrevRotorUnit(): void {
        this.rotorIndex = (this.rotorIndex - 1) % NO_OF_NAV_UNITS;
        this.onChangeEmitter.fire({
            value: RotorEvent.ROTOR_CHANGED,
        });
        console.log(this.rotorIndex);
    }
    public getCurrentUnit(): number {
        return this.rotorIndex;
    }
}
