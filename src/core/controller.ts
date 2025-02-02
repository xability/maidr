import {PlotFactory} from '../model/factory';
import {Maidr} from '../model/grammar';
import {Plot} from "../model/plot";
import {AudioService} from './service/audio';
import {AutoplayService} from './service/autoplay';
import {BrailleService} from './service/braille';
import {DisplayService} from './service/display';
import {KeymapService} from './service/keymap';
import {NotificationService} from './service/notification';
import {ReviewService} from './service/review';
import {TextService} from './service/text';

export class Controller {
  private readonly plot: Plot;

  private readonly display: DisplayService;
  private readonly notification: NotificationService;

  private readonly audio: AudioService;
  private readonly braille: BrailleService;
  private readonly text: TextService;
  private readonly review: ReviewService;

  private readonly autoplay: AutoplayService;
  private readonly keymap: KeymapService;

  public constructor(maidr: Maidr, display: DisplayService) {
    this.plot = PlotFactory.create(maidr);

    this.display = display;
    this.notification = new NotificationService(this.display);

    this.audio = new AudioService(this.notification, this.plot.hasMultiPoints);
    this.braille = new BrailleService(
      this.notification,
      this.display,
      this.plot
    );
    this.text = new TextService(this.notification, this.display.textDiv);
    this.review = new ReviewService(this.notification, this.display, this.text);

    this.autoplay = new AutoplayService(
      this.notification,
      this.text,
      this.plot
    );
    this.keymap = new KeymapService({
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

    this.review.destroy();
    this.braille.destroy();
    this.audio.destroy();

    this.display.destroy();
  }
}
