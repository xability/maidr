import AudioManager from './manager/audio';
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

  private readonly display: DisplayManager;
  private readonly notification: NotificationManager;
  private readonly keyBinding: KeyBinding;

  private readonly plot: Plot;

  constructor(maidr: Maidr) {
    this.display = new DisplayManager(maidr.id);
    this.plot = PlotFactory.create(maidr);

    this.notification = new NotificationManager(this.display.notificationDiv);
    this.audio = new AudioManager(this.notification);
    this.braille = new BrailleManager(
      this.notification,
      this.plot.state,
      this.display.brailleDiv,
      this.display.brailleInput
    );
    this.text = new TextManager(this.notification, this.display.textDiv);

    const commandContext = {
      audio: this.audio,
      text: this.text,
      braille: this.braille,
      plot: this.plot,
    };
    this.keyBinding = new KeyBinding(commandContext);
    this.keyBinding.register();
  }

  public destroy(): void {
    this.keyBinding.unregister();
    this.audio.destroy();
    this.display.destroy();
  }
}
