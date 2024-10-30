import {Observer} from '../observer';
import Constant from '../../util/constant';

export default class ReviewManager implements Observer {
  private enabled: boolean;
  private reviewDiv?: HTMLElement;
  private textDiv?: HTMLElement;

  private readonly toggleFocus?: () => void;

  constructor(
    toggleFocus: () => void,
    reviewDiv?: HTMLElement,
    textDiv?: HTMLElement
  ) {
    this.enabled = false;
    this.reviewDiv = reviewDiv;
    this.textDiv = textDiv;
    this.toggleFocus = toggleFocus;
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
    this.reviewDiv.innerHTML = textDivInfo;
  }

  private getTextDivInfo(): string {
    const textDiv = this.textDiv?.innerHTML;
    return textDiv ?? Constant.EMPTY;
  }

  private hideReviewDiv(): void {
    this.reviewDiv?.classList.add(Constant.HIDDEN);
    this.reviewDiv!.innerHTML = Constant.EMPTY;
  }
}
