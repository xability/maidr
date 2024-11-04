import {Observer} from '../observer';
import Constant from '../../util/constant';

export default class ReviewManager implements Observer {
  private enabled: boolean;
  private reviewDiv?: HTMLElement;
  private textDiv?: HTMLElement;
  private reviewInput?: HTMLInputElement;

  private readonly toggleFocus?: () => void;

  constructor(
    toggleFocus: () => void,
    reviewDiv?: HTMLElement,
    textDiv?: HTMLElement,
    reviewInput?: HTMLInputElement
  ) {
    this.enabled = false;
    this.reviewDiv = reviewDiv;
    this.textDiv = textDiv;
    this.toggleFocus = toggleFocus;
    this.reviewInput = reviewInput;
  }

  public toggle(): void {
    this.enabled = !this.enabled;
    this.enabled ? this.update() : this.hideReviewDiv();
    if (this.toggleFocus) {
      this.toggleFocus();
    }
  }

  public update(): void {
    if (!this.reviewDiv) return;
    this.reviewDiv.classList.remove(Constant.HIDDEN);
    const textDivInfo = this.getTextDivInfo();
    this.reviewInput!.value = textDivInfo;
  }

  private getTextDivInfo(): string {
    let textDivInfo = this.textDiv?.innerHTML;
    textDivInfo = textDivInfo?.replace(/<\/?p>/g, '').trim();
    return textDivInfo ?? Constant.EMPTY;
  }

  private hideReviewDiv(): void {
    this.reviewDiv?.classList.add(Constant.HIDDEN);
    this.reviewInput!.value = Constant.EMPTY;
  }
}
