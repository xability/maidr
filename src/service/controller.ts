import type { Maidr } from '@type/maidr';
import { Figure } from '@type/plot';
import { AudioService } from './audio';
import { AutoplayService } from './autoplay';
import { BrailleService } from './braille';
import { ChatService } from './chat';
import { ContextService } from './context';
import { DisplayService } from './display';
import { HelpService } from './help';
import { KeybindingService } from './keybinding';
import { NotificationService } from './notification';
import { ReviewService } from './review';
import { SettingsService } from './settings';
import { TextService } from './text';

export class ControllerService {
  private readonly figure: Figure;
  private readonly context: ContextService;

  public readonly display: DisplayService;
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

  public constructor(maidr: Maidr, maidrRoot: HTMLElement, plot: HTMLElement) {
    this.figure = new Figure(maidr);
    this.context = new ContextService(this.figure);

    this.display = new DisplayService(this.context, maidrRoot, plot);
    this.notification = new NotificationService(this.context, this.display);
    this.settings = new SettingsService(this.display);

    this.audio = new AudioService(this.notification, false);
    this.braille = new BrailleService(this.context, this.notification, this.display);
    this.text = new TextService(this.notification, this.display.textDiv);
    this.review = new ReviewService(this.notification, this.display, this.text);

    this.autoplay = new AutoplayService(this.context, this.notification, this.text);
    this.help = new HelpService(this.display);
    this.chat = new ChatService(this.display, maidr);

    this.keybinding = new KeybindingService(
      this.context,
      {
        context: this.context,
        audio: this.audio,
        braille: this.braille,
        text: this.text,
        review: this.review,
        notification: this.notification,
        autoplay: this.autoplay,
      },
    );
    this.keybinding.register();
    this.registerObservers();
  }

  public destroy(): void {
    this.keybinding.unregister();
    this.autoplay.destroy();

    this.review.destroy();
    this.braille.destroy();
    this.audio.destroy();

    this.display.destroy();
    this.figure.destroy();
  }

  private registerObservers(): void {
    this.figure.addObserver(this.text);
    this.figure.subplots.forEach(subplotRow => subplotRow.forEach((subplot) => {
      subplot.addObserver(this.text);
      subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
        trace.addObserver(this.audio);
        trace.addObserver(this.braille);
        trace.addObserver(this.text);
      }));
    }));
  }
}
