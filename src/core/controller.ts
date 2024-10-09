import AudioManager from './manager/audio';
import {AutoplayManager} from "./manager/autoplay";
import BrailleManager from './manager/braille';
import DisplayManager from './manager/display';
import KeyBinding from './key_binding';
import {Maidr} from '../plot/grammar';
import NotificationManager from './manager/notification';
import {Plot} from '../plot/plot';
import {PlotFactory} from '../plot/factory';
import TextManager from './manager/text';

export default class Controller {
  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;
  private readonly text: TextManager;
  private readonly autoplay: AutoplayManager;

  private readonly display: DisplayManager;
  private readonly notification: NotificationManager;
  private readonly keyBinding: KeyBinding;

  private readonly plot: Plot;

  constructor(maidr: Maidr, display?: DisplayManager) {
    // If init has created the displayManager object, use it or else create a new one
    this.display = display ?? new DisplayManager(maidr.id);
    this.plot = PlotFactory.create(maidr);

    this.notification = new NotificationManager(this.display.notificationDiv);
    this.audio = new AudioManager(this.notification);
    this.braille = new BrailleManager(
      this.notification,
      this.plot.state,
      (index: number) => this.plot.moveToIndex(index),
      this.display.brailleDiv,
      this.display.brailleInput
    );
    this.text = new TextManager(this.notification, this.display.textDiv);
    this.autoplay = new AutoplayManager(this.plot);

    const commandContext = {
      audio: this.audio,
      text: this.text,
      braille: this.braille,
      plot: this.plot,
    };
    this.keyBinding = new KeyBinding(
      this.plot,
      this.audio,
      this.braille,
      this.text,
      this.autoplay
    );
    this.keyBinding.register();

    this.plot.addObserver(this.audio);
    this.plot.addObserver(this.braille);
    this.plot.addObserver(this.text);
  }

  public destroy(): void {
    this.plot.removeObserver(this.text);
    this.plot.removeObserver(this.braille);
    this.plot.removeObserver(this.audio);

    this.keyBinding.unregister();
    this.braille.destroy();
    this.audio.destroy();
    this.display.destroy();
  }
}
