import { AbstractPlot } from './plot';
import Audio from '../engine/audio';
import { LineData, Maidr } from "./maidr";
import Coordinate from "./coordinate";
export default class LinePlot extends AbstractPlot {
    constructor(audio: Audio, maidr: Maidr);
    protected initCoordinate(data: LineData): Coordinate;
}
