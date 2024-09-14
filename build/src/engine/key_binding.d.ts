import Audio from './audio';
import { Plot } from '../core/plot';
import Display from './display';
export default class KeyBinding {
    private bindings;
    private readonly audio;
    private readonly display;
    private readonly plot;
    constructor(audio: Audio, display: Display, plot: Plot);
    private createBindings;
    private createCommand;
    register(): void;
    unregister(): void;
}
