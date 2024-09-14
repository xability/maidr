import { Maidr } from "./maidr";
import { Plot } from "./plot";
export default abstract class PlotFactory {
    private static readonly audio;
    static create(maidr: Maidr): Plot;
}
