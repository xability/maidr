import Audio from "../audio";
import Maidr from "../maidr";
export default interface Plot {
    autoplayForward(): void;
    autoplayBackward(): void;
    moveUp(): void;
    moveRight(): void;
    moveDown(): void;
    moveLeft(): void;
}
export declare abstract class AbstractPlot implements Plot {
    protected readonly audio: Audio;
    protected readonly maidr: Maidr;
    protected readonly title?: string;
    protected readonly xAxis?: string;
    protected readonly yAxis?: string;
    protected constructor(audio: Audio, maidr: Maidr);
    autoplayBackward(): void;
    autoplayForward(): void;
    moveDown(): void;
    moveLeft(): void;
    moveRight(): void;
    moveUp(): void;
}
