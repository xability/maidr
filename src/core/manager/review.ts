import {Command} from '../command/command';
import Constant from '../../util/constant';

export class ToggleReview implements Command {
  private enabled: boolean;
  private reviewDiv?: HTMLElement;

  // Review object takes an HTML reference to reviewDiv and maintains a boolean flag
  constructor() {
    this.enabled = false;
    this.reviewDiv = document.getElementById(Constant.REVIEW_CONTAINER_ID) as
      | HTMLElement
      | undefined;
  }

  public execute(): void {
    this.enabled = !this.enabled;
    this.updateReviewDiv();
  }

  private updateReviewDiv(): void {
    if (!this.reviewDiv) return;

    if (this.enabled) {
      this.showReviewDiv();
    } else {
      this.hideReviewDiv();
    }
  }

  // showReviewDiv() and hideReviewDiv() are used to show and hide the reviewDiv element based on the status of the enabled flag
  private showReviewDiv(): void {
    this.reviewDiv?.classList.remove(Constant.HIDDEN);
    const textDiv = this.reviewDiv?.parentNode?.querySelector(
      `#${Constant.TEXT_CONTAINER_ID}`
    ) as HTMLElement | null;
    const textDivInfo = textDiv?.innerHTML || Constant.EMPTY;
    // Text from infoDiv is added to reviewDiv
    if (this.reviewDiv) {
      this.reviewDiv.innerHTML = textDivInfo;
    }
    // Focus is set to reviewDiv from figure wrapper
    this.reviewDiv?.focus();
  }

  private hideReviewDiv(): void {
    this.reviewDiv?.classList.add(Constant.HIDDEN);
    if (this.reviewDiv) {
      this.reviewDiv.innerHTML = Constant.EMPTY;
    }
    // Focus is set back to the figure wrapper
    (this.reviewDiv?.parentNode as HTMLElement)?.focus();
  }
}
