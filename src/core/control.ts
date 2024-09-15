import Action from './keyboard/action';
import Audio from './audio';
import Braille from './braille';
import Display from './display';
import KeyBinding from './keyboard/key_binding';
import {Maidr} from '../plot/maidr';
import Notification from './notification';
import {Plot} from '../plot/plot';
import PlotFactory from '../plot/factory';

export default class Control implements Action {
  private readonly audio: Audio;
  private readonly display: Display;
  private readonly braille: Braille;

  private readonly notification: Notification;
  private readonly keyBinding: KeyBinding;

  private readonly plot: Plot;

  constructor(maidr: Maidr) {
    this.notification = new Notification();
    this.plot = PlotFactory.create(maidr);

    this.audio = new Audio(this.notification);
    this.display = new Display(this.notification, maidr.id);
    this.braille = new Braille(this.notification, this.plot.coordinate);

    this.keyBinding = new KeyBinding(this);
    this.keyBinding.register();
  }

  public destroy(): void {
    this.notification.destroy();
    this.audio.destroy();
    this.display.destroy();
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
    this.braille.toggle();
  }

  public toggleSound(): void {
    this.audio.toggle();
  }

  public toggleText(): void {
    this.display.toggle();
  }
}
