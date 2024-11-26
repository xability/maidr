import AudioManager from './manager/audio';
import AutoplayManager from './manager/autoplay';
import BrailleManager from './manager/braille';
import DisplayManager from './manager/display';
import KeymapManager from './manager/keymap';
import {Maidr} from '../model/grammar';
import NotificationManager from './manager/notification';
import {PlotFactory} from '../model/factory';
import {Plot} from './interface';
import ReviewManager from './manager/review';
import TextManager from './manager/text';

export default class Controller {
  private readonly plot: Plot;

  private readonly display: DisplayManager;
  private readonly notification: NotificationManager;

  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;
  private readonly text: TextManager;
  private readonly review: ReviewManager;

  private readonly autoplay: AutoplayManager;
  private readonly keymap: KeymapManager;

  constructor(maidr: Maidr, display: DisplayManager) {
    this.plot = PlotFactory.create(maidr);

    this.display = display;
    this.notification = new NotificationManager(this.display.notificationDiv);

    this.audio = new AudioManager(this.notification);
    this.braille = new BrailleManager(
      this.notification,
      this.display,
      this.plot,
      this.plot.state
    );
    this.text = new TextManager(this.notification, this.display.textDiv);
    this.review = new ReviewManager(this.notification, this.display, this.text);

    this.autoplay = new AutoplayManager(
      this.notification,
      this.text,
      this.plot
    );

    this.keymap = new KeymapManager({
      plot: this.plot,
      audio: this.audio,
      braille: this.braille,
      text: this.text,
      review: this.review,
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
    this.autoplay.destroy();

    this.braille.destroy();
    this.audio.destroy();

    this.display.destroy();
  }
}
