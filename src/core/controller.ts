import Action from './keyboard/action';
import AudioManager from './audio';
import BrailleManager from './braille';
import DisplayManager from './display';
import KeyBinding from './keyboard/key_binding';
import {Maidr} from '../plot/grammar';
import NotificationManager from './notification';
import {Plot, PlotType} from '../plot/plot';
import {PlotFactory} from '../plot/factory';

export default class Controller implements Action {
  private readonly audio: AudioManager;
  private readonly display: DisplayManager;
  private readonly braille: BrailleManager;

  private readonly notification: NotificationManager;
  private readonly keyBinding: KeyBinding;

  private readonly plot: Plot;

  constructor(maidr: Maidr) {
    this.notification = new NotificationManager();
    this.plot = PlotFactory.create(maidr);

    this.audio = new AudioManager(this.notification);
    this.braille = new BrailleManager(this.notification);
    this.display = new DisplayManager(
      maidr.id,
      this.notification,
      this.braille
    );

    this.keyBinding = new KeyBinding(this);
    this.keyBinding.register();
  }

  public destroy(): void {
    this.notification.destroy();
    this.audio.destroy();
    this.display.destroy();
    this.braille.destroy();
    this.keyBinding.unregister();
  }

  public moveUp(): void {
    if (this.plot.type !== PlotType.BAR) {
      this.plot.moveUp();
      this.show();
    }
  }

  public moveDown(): void {
    if (this.plot.type !== PlotType.BAR) {
      this.plot.moveDown();
      this.show();
    }
  }

  public moveLeft(): void {
    this.plot.moveLeft();
    this.show();
  }

  public moveRight(): void {
    this.plot.moveRight();
    this.show();
  }

  public toggleBraille(): void {
    this.braille.toggle(this.plot.state());
  }

  public toggleSound(): void {
    this.audio.toggle();
  }

  public toggleText(): void {
    this.display.toggle();
  }

  public repeatPoint(): void {
    this.show();
  }

  public showXLabel(): void {
    this.display.showXLabel(this.plot.state());
  }

  public showYLabel(): void {
    this.display.showYLabel(this.plot.state());
  }

  private show(): void {
    this.display.show(this.plot.state());
    this.audio.play(this.plot.state());
    this.braille.show(this.plot.state());
  }
}
