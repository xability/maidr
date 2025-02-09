import type { Maidr } from '@model/grammar';
import type { Plot } from '@model/plot';
import type { DisplayService } from './display';
import { PlotFactory } from '@model/factory';
import { HelpService } from '@service/help';
import { AudioService } from './audio';
import { AutoplayService } from './autoplay';
import { BrailleService } from './braille';
import { KeybindingService } from './keybinding';
import { NotificationService } from './notification';
import { ReviewService } from './review';
import { TextService } from './text';

export class ControllerService {
  private readonly plot: Plot;

  private readonly display: DisplayService;
  private readonly notification: NotificationService;

  private readonly audio: AudioService;
  private readonly braille: BrailleService;
  private readonly text: TextService;
  private readonly review: ReviewService;

  private readonly autoplay: AutoplayService;
  private readonly help: HelpService;
  private readonly keybinding: KeybindingService;

  public constructor(maidr: Maidr, display: DisplayService) {
    this.plot = PlotFactory.create(maidr);

    this.display = display;
    this.notification = new NotificationService(this.display);

    this.audio = new AudioService(this.notification, this.plot.hasMultiPoints);
    this.braille = new BrailleService(
      this.notification,
      this.display,
      this.plot,
    );
    this.text = new TextService(this.notification, this.display.textDiv);
    this.review = new ReviewService(this.notification, this.display, this.text);

    this.autoplay = new AutoplayService(
      this.notification,
      this.text,
      this.plot,
    );
    this.help = new HelpService(this.display);
    this.keybinding = new KeybindingService({
      plot: this.plot,
      audio: this.audio,
      braille: this.braille,
      text: this.text,
      review: this.review,
      autoplay: this.autoplay,
      help: this.help,
    });
    this.keybinding.register();

    this.plot.addObserver(this.audio);
    this.plot.addObserver(this.braille);
    this.plot.addObserver(this.text);
  }

  public destroy(): void {
    this.plot.removeObserver(this.text);
    this.plot.removeObserver(this.braille);
    this.plot.removeObserver(this.audio);

    this.keybinding.unregister();
    this.autoplay.destroy();

    this.review.destroy();
    this.braille.destroy();
    this.audio.destroy();

    this.display.destroy();
  }
}
