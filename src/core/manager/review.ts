import hotkeys from 'hotkeys-js';
import {EventType} from '../..';
import {PlotState} from '../../model/state';
import {Observer, Plot} from '../interface';
import DisplayManager, {ActiveFocus} from './display';
import NotificationManager from './notification';
import TextManager from './text';

export default class ReviewManager implements Observer {
  private enabled: boolean;

  private readonly notification: NotificationManager;
  private readonly display: DisplayManager;
  private readonly text: TextManager;
  private readonly plot: Plot;

  private readonly reviewInput?: HTMLTextAreaElement;
  private readonly reviewKeyHandler?: (event: KeyboardEvent) => void;

  constructor(
    notification: NotificationManager,
    display: DisplayManager,
    text: TextManager,
    plot: Plot
  ) {
    this.enabled = false;
    this.notification = notification;
    this.display = display;
    this.text = text;
    this.plot = plot;
    if (!display.brailleReviewTextArea) {
      return;
    }

    this.reviewInput = display.brailleReviewTextArea;

    this.reviewKeyHandler = (e: KeyboardEvent) => {
      const isNavigationKey =
        e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End';
      const isCtrlKey = e.ctrlKey || e.metaKey;
      const isModifierKey = isCtrlKey || e.shiftKey;
      if (
        !isNavigationKey &&
        !(isModifierKey && isNavigationKey) &&
        !(isCtrlKey && e.key === 'a') &&
        !(isCtrlKey && e.key === 'c') &&
        !(e.key === 'Tab')
      ) {
        e.preventDefault();
      }
    };

    this.reviewInput.addEventListener(
      EventType.KEY_DOWN,
      this.reviewKeyHandler
    );

    if (this.enabled) {
      this.reviewInput.value =
        this.reviewInput.value + '\n' + this.text.format(plot.state);
    }
  }

  destroy() {
    if (this.enabled) {
      this.reviewInput!.value = this.reviewInput!.value.split('\n')
        .slice(0, -1)
        .join('\n');
    }
  }
  toggle() {
    if (!this.reviewInput) {
      return;
    }

    if (this.enabled) {
      this.enabled = false;
      hotkeys.setScope('DEFAULT');
      const brailleReviewInputSplitArray = this.reviewInput.value.split('\n');
      if (brailleReviewInputSplitArray.length > 1) {
        this.reviewInput.value =
          brailleReviewInputSplitArray[this.display.brailleLinesStart];
      } else {
        this.reviewInput.value = '';
      }
      if (this.display.lastActiveFocus === ActiveFocus.REVIEW) {
        this.display.lastActiveFocus = ActiveFocus.NONE;
      }
    } else {
      this.enabled = true;
      this.display.lastActiveFocus = ActiveFocus.REVIEW;
      hotkeys.setScope('REVIEW');
      this.update(this.plot.state);
    }

    const message = `Review is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
    this.display.toggleBrailleReviewFocus();
  }
  update(state: PlotState): void {
    if (!this.enabled || state.empty) {
      return;
    }
    if (!this.reviewInput) {
      return;
    }
    if (this.reviewInput.value.includes('\n')) {
      // add to this.display.reviewLineStart
      const brailleReviewInputSplitArray = this.reviewInput.value.split('\n');
      if (brailleReviewInputSplitArray.length > 1) {
        brailleReviewInputSplitArray[this.display.reviewLineStart] =
          this.text.format(state);
        this.reviewInput.value = brailleReviewInputSplitArray.join('\n');
      } else {
        this.reviewInput.value = this.text.format(state);
      }
    } else {
      this.reviewInput.value =
        this.reviewInput.value + '\n' + this.text.format(state);
    }
    if (this.display.lastActiveFocus === ActiveFocus.REVIEW) {
      const lastNewlineIndex = this.reviewInput.value.lastIndexOf('\n');
      const caretPosition = lastNewlineIndex + 1; // Start position of the last line
      this.reviewInput.setSelectionRange(caretPosition, caretPosition);
    } else if (this.display.lastActiveFocus === ActiveFocus.BRAILLE) {
      this.reviewInput.setSelectionRange(
        state.braille.index,
        state.braille.index
      );
    }
  }
}
