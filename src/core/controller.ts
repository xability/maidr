import AudioManager from './manager/audio';
import AutoplayManager from './manager/autoplay';
import BrailleManager from './manager/braille';
import DisplayManager from './manager/display';
import KeymapManager from './manager/keymap';
import {Maidr} from '../model/grammar';
import NotificationManager from './manager/notification';
import {PlotFactory} from '../model/factory';
import {Plot} from './interface';
import TextManager from './manager/text';

export default class Controller {
  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;
  private readonly text: TextManager;

  private readonly autoplay: AutoplayManager;
  private readonly display: DisplayManager;
  private readonly notification: NotificationManager;
  private readonly keymap: KeymapManager;

  private readonly plot: Plot;

  constructor(maidr: Maidr, display: DisplayManager) {
    this.display = display;
    this.plot = PlotFactory.create(maidr);

    this.notification = new NotificationManager(this.display.notificationDiv);
    this.audio = new AudioManager(this.notification);
    this.braille = new BrailleManager(
      this.notification,
      this.plot.state,
      (index: number) => this.plot.moveToIndex(index),
      () => this.display.toggleBrailleFocus(),
      this.display.brailleDiv,
      this.display.brailleInput
    );
    this.text = new TextManager(this.notification, this.display.textDiv);
    this.autoplay = new AutoplayManager(
      this.notification,
      this.plot,
      this.plot.state
    );

    this.keymap = new KeymapManager({
      plot: this.plot,
      audio: this.audio,
      text: this.text,
      braille: this.braille,
      autoplay: this.autoplay,
    });
    this.keymap.register();

    this.plot.addObserver(this.audio);
    this.plot.addObserver(this.braille);
    this.plot.addObserver(this.text);
  }

  public destroy(): void {
    this.plot.removeObserver(this.text);
    this.plot.removeObserver(this.braille);
    this.plot.removeObserver(this.audio);

    this.keymap.unregister();
    this.braille.destroy();
    this.audio.destroy();
    this.display.destroy();
  }
}
