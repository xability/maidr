import Audio from './audio';
import Display from './display';
import { Plot } from '../core/plot';
export default interface Command {
    execute(event?: KeyboardEvent): void;
}
export declare class MoveUpCommand implements Command {
    private readonly plot;
    constructor(plot: Plot);
    execute(): void;
}
export declare class MoveDownCommand implements Command {
    private readonly plot;
    constructor(plot: Plot);
    execute(): void;
}
export declare class MoveLeftCommand implements Command {
    private readonly plot;
    constructor(plot: Plot);
    execute(): void;
}
export declare class MoveRightCommand implements Command {
    private readonly plot;
    constructor(plot: Plot);
    execute(): void;
}
export declare class ToggleSoundCommand implements Command {
    private readonly audio;
    constructor(audio: Audio);
    execute(): void;
}
export declare class ToggleTextCommand implements Command {
    private readonly display;
    constructor(display: Display);
    execute(): void;
}
