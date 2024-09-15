import Display from './display';
import Audio from './audio';
import {Plot} from '../core/plot';
import {Maidr} from '../core/maidr';
import Braille from './braille';
import PlotFactory from '../core/factory';
import Action from './Action';
import KeyBinding from './key_binding';

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
    console.log('Move up');
  }

  public moveDown(): void {
    console.log('Move down');
  }

  public moveLeft(): void {
    console.log('Move left');
  }

  public moveRight(): void {
    console.log('Move right');
  }

  public toggleBraille(): void {
    console.log('Toggle braille');
  }

  public toggleSound(): void {
    console.log('Toggle sound');
  }

  public toggleText(): void {
    console.log('Toggle text');
  }
}
