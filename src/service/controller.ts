import type { Maidr } from '@type/maidr';
import type { Plot } from '@type/plot';
import type { DisplayService } from './display';
import type { Movable } from '@type/movable';
import { PlotFactory } from '@model/factory';
import { ChatService } from '@service/chat';
import { HelpService } from '@service/help';
import { SettingsService } from '@service/settings';
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
  public readonly settings: SettingsService;

  public readonly audio: AudioService;
  private readonly braille: BrailleService;
  private readonly text: TextService;
  private readonly review: ReviewService;

  private readonly autoplay: AutoplayService;
  public readonly help: HelpService;
  public readonly chat: ChatService;
  private readonly keybinding: KeybindingService;

  public constructor(display: DisplayService, maidr: Maidr) {
    this.plot = PlotFactory.create(maidr);
    this.display = display;
    this.notification = new NotificationService(this.display);
    this.settings = new SettingsService(this.display);
    this.audio = new AudioService(this.notification, this.plot.hasMultiPoints);
    this.braille = new BrailleService(
      this.notification,
      this.display,
      this.plot as Movable,
    );
    this.text = new TextService(this.notification, this.display.textDiv);
    this.review = new ReviewService(this.notification, this.display, this.text);

    this.autoplay = new AutoplayService(
      this.notification,
      this.text,
      this.plot,
      this.audio,
    );
    this.help = new HelpService(this.display);
    this.chat = new ChatService(this.display, maidr);

    this.keybinding = new KeybindingService({
      plot: this.plot,
      audio: this.audio,
      braille: this.braille,
      text: this.text,
      review: this.review,
      notification: this.notification,
      autoplay: this.autoplay,
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
