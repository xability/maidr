import { BarAudio } from "./BarAudio";
import BarDisplay from "./BarDisplay";
import { Position } from "../../helpers/Position";
import { Plot } from "../Plot";
import Control from "../../controls";

export class BarPlot extends Plot {
  maxY: number = 0;
  maxX: number = 0;
  minY: number = 0;
  minX: number = 0;
  plotData: any;
  position: Position = new Position();
  audio: BarAudio = new BarAudio();
  display: BarDisplay = new BarDisplay();
  control: Control = new Control();

  constructor() {
    super();
  }
}
