import { AbstractPlot } from './plot';
import Audio from '../engine/audio';
import { BarData, Maidr } from "./maidr";
import Coordinate from './coordinate';
export default class BarPlot extends AbstractPlot {
    constructor(audio: Audio, maidr: Maidr);
    protected initCoordinate(data: BarData): Coordinate;
}
