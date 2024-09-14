import {AbstractPlot} from "./plot";
import Audio from "../audio";
import Maidr from "../maidr";

type LineData = { x: [number], y: [number] }

export default class LinePlot extends AbstractPlot {

    private readonly data: LineData

    constructor(audio: Audio, maidr: Maidr) {
        super(audio, maidr);
        this.data = maidr.data as LineData
    }

}