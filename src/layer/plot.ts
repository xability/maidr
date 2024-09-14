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

export abstract class AbstractPlot implements Plot {

    protected readonly audio: Audio;

    // Plot information.
    protected readonly maidr: Maidr;
    protected readonly title?: string;
    protected readonly xAxis?: string;
    protected readonly yAxis?: string;

    protected constructor(audio: Audio, maidr: Maidr) {
        this.audio = audio;

        this.maidr = maidr;
        this.title = maidr.title;
    }

    public autoplayBackward(): void {
    }

    public autoplayForward(): void {
    }

    public moveDown(): void {
    }

    public moveLeft(): void {
    }

    public moveRight(): void {
    }

    public moveUp(): void {
    }

}
