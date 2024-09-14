import {AbstractPlot} from "./plot";
import Audio from "../audio";
import Maidr from "../maidr";

type BarData = [number];

export default class BarPlot extends AbstractPlot {

    private readonly data: BarData;

    constructor(audio: Audio, maidr: Maidr) {
        super(audio, maidr);
        this.data = maidr.data as BarData
    }

}