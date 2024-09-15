import Display from "./display";
import Audio from "./audio";
import { Plot } from "../core/plot";
import { Maidr } from "../core/maidr";
import Braille from "./braille";
import PlotFactory from "../core/factory";
import Action from "./Action";
import KeyBinding from "./key_binding";

export default class Control implements Action {

  private readonly plot: Plot;

  private readonly audio: Audio;

  private readonly display: Display;

  private readonly braille: Braille;

  private readonly keyBinding: KeyBinding;

  constructor(maidr: Maidr) {
    this.audio = new Audio();
    this.display = new Display();

    this.plot = PlotFactory.create(maidr);
    this.braille = new Braille(this.plot.coordinate);

    this.keyBinding = new KeyBinding(this);
    this.keyBinding.register();
  }

  public destroy(): void {
    this.keyBinding.unregister();
  }

  public moveUp(): void {

  }

  public moveDown(): void {
  }

  public moveLeft(): void {
  }

  public moveRight(): void {
  }

  public toggleBraille(): void {
  }

  public toggleSound(): void {
  }

  public toggleText(): void {
  }
}
