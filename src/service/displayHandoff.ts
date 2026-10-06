/**
 * How long a frame asking for the display waits to hear that another frame
 * holds it. Frames on one page answer within a task or two; no answer by then
 * means nobody holds it, and the ask is not worth more of the reader's time.
 */
const HANDOFF_ACK_TIMEOUT_MS = 150;

/**
 * A message between frames about who holds the display.
 */
interface HandoffMessage {
  type: 'release' | 'releasing' | 'released' | 'return';
  from: string;
  to?: string;
}

/**
 * What a frame's connection does when the handoff asks it to.
 */
export interface HandoffHolder {
  /**
   * Lets the display go for another frame: the connection is marked closed at
   * once, and the device itself closed behind whatever is already queued for
   * it.
   *
   * The pins are left as they are: the frame that asked is about to draw.
   *
   * @returns Resolves once the device is closed, or null when this frame holds
   * no display
   */
  release: () => Promise<void> | null;

  /**
   * Takes the display up again, given back by a frame that asked for it and
   * then could not open it.
   */
  retake: () => void;
}

/**
 * Passes a tactile display between the frames of one page.
 *
 * A device can be open in one frame at a time, and in a notebook or a rendered
 * document every chart is a frame of its own. A connection the reader made in
 * one chart was kept there for as long as that frame lived, so every other
 * chart found the device busy and the reader had to connect again in each one.
 * Asking is what lets the connection follow the reader from chart to chart
 * until they disconnect it themselves.
 *
 * Each kind of display has a channel of its own, so asking for one never makes
 * a frame give up a different device.
 */
export class DisplayHandoff {
  /**
   * This frame's name on the channel, so it can tell its own asks from another
   * frame's.
   */
  private readonly frameId = Math.random().toString(36).slice(2);

  /**
   * The channel to the page's other frames, opened on first use; null where
   * the browser has none.
   */
  private channel: BroadcastChannel | null | undefined;

  private readonly channelName: string;
  private readonly holder: HandoffHolder;
  private readonly closeTimeoutMs: number;

  /**
   * @param channelName - The channel this kind of display is handed over on
   * @param holder - This frame's connection
   * @param closeTimeoutMs - The longest the holder takes to close the device,
   * which is how long an ask waits once it is told the device is closing
   */
  public constructor(channelName: string, holder: HandoffHolder, closeTimeoutMs: number) {
    this.channelName = channelName;
    this.holder = holder;
    this.closeTimeoutMs = closeTimeoutMs;
  }

  /**
   * Asks whichever other frame on the page holds the display to let it go,
   * and waits until it has.
   *
   * Resolves at once where no frame holds the display, or where the browser
   * has no way to ask.
   *
   * @returns The frame that let the display go, to be given it back should
   * opening it here fail, or null when no frame held it
   */
  public request(): Promise<string | null> {
    const channel = this.open();
    if (channel === null) {
      return Promise.resolve(null);
    }
    return new Promise<string | null>((resolve) => {
      let settled = false;
      let holder: string | null = null;
      let timer: ReturnType<typeof setTimeout>;
      const listening = new AbortController();
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        listening.abort();
        resolve(holder);
      };
      const listen = (event: MessageEvent<HandoffMessage>): void => {
        const message = event.data;
        if (message?.to !== this.frameId) {
          return;
        }
        if (message.type === 'releasing') {
          holder = message.from;
          // Someone holds it: wait for the close, bounded as the close is.
          clearTimeout(timer);
          timer = setTimeout(finish, this.closeTimeoutMs + HANDOFF_ACK_TIMEOUT_MS);
        } else if (message.type === 'released') {
          finish();
        }
      };
      channel.addEventListener('message', listen, { signal: listening.signal });
      timer = setTimeout(finish, HANDOFF_ACK_TIMEOUT_MS);
      channel.postMessage({ type: 'release', from: this.frameId } satisfies HandoffMessage);
    });
  }

  /**
   * Gives the display back to the frame that let it go, when opening it here
   * failed.
   *
   * The ask closed a connection that was working. A frame that then cannot
   * open the device -- a Bluetooth link that drops as it reconnects, a display
   * switched off a moment ago -- would otherwise leave the reader with no
   * display anywhere, for a failure that had nothing to do with the chart
   * that had it.
   *
   * @param holder - The frame that let it go, or null when none did
   */
  public giveBack(holder: string | null): void {
    const channel = this.open();
    if (holder === null || channel === null) {
      return;
    }
    channel.postMessage({ type: 'return', from: this.frameId, to: holder } satisfies HandoffMessage);
  }

  /**
   * Answers another frame's message.
   * @param channel - The channel it came on
   * @param message - The message
   */
  private handle(channel: BroadcastChannel, message: HandoffMessage): void {
    if (message?.type === 'return' && message.to === this.frameId) {
      // Given back: the frame that asked for it could not open it after all.
      this.holder.retake();
      return;
    }
    if (message?.type !== 'release' || message.from === this.frameId) {
      return;
    }
    const closing = this.holder.release();
    if (closing === null) {
      return;
    }
    channel.postMessage({ type: 'releasing', from: this.frameId, to: message.from } satisfies HandoffMessage);
    void closing.then(() => {
      channel.postMessage({ type: 'released', from: this.frameId, to: message.from } satisfies HandoffMessage);
    });
  }

  /**
   * The channel to the page's other frames, opened on first use.
   */
  private open(): BroadcastChannel | null {
    if (this.channel === undefined) {
      const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(this.channelName);
      channel?.addEventListener('message', (event: MessageEvent<HandoffMessage>) => {
        this.handle(channel, event.data);
      });
      this.channel = channel;
    }
    return this.channel;
  }
}
