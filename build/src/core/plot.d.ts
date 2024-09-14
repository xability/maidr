import Audio from '../engine/audio';
import { BarData, LineData, Maidr } from "./maidr";
import Coordinate from './coordinate';
export interface Plot {
    get title(): string;
    get xAxis(): string;
    get yAxis(): string;
    moveUp(): void;
    moveRight(): void;
    moveDown(): void;
    moveLeft(): void;
    autoplayForward(): void;
    autoplayBackward(): void;
}
declare enum Orientation {
    VERTICAL = "vert",
    HORIZONTAL = "horz"
}
export declare abstract class AbstractPlot implements Plot {
    protected readonly audio: Audio;
    protected static readonly DEFAULT_TITLE: string;
    protected static readonly DEFAULT_X_AXIS: string;
    protected static readonly DEFAULT_Y_AXIS: string;
    readonly title: string;
    readonly xAxis: string;
    readonly yAxis: string;
    protected readonly orientation: Orientation;
    protected readonly coordinate: Coordinate;
    protected constructor(audio: Audio, maidr: Maidr);
    protected abstract initCoordinate(data: BarData | LineData): Coordinate;
    moveDown(): void;
    moveLeft(): void;
    moveRight(): void;
    moveUp(): void;
    autoplayBackward(): void;
    autoplayForward(): void;
}
export {};
