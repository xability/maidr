import Coordinate from '../core/coordinate';
export default class Audio {
    private readonly audioContext;
    private readonly compressor;
    private enabled;
    constructor();
    private initCompressor;
    playTone(frequency: number, duration: number, panning: number, volume: number | undefined, wave: OscillatorType | undefined, position: Coordinate): void;
    toggle(): void;
}
