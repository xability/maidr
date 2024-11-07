import Constant from '../../util/constant';

export default class ReviewManager {
  private enabled: boolean;

  private readonly textInfo?: () => string
  private readonly toggleFocus?: () => void;

  private readonly reviewDiv?: HTMLElement;
  private readonly reviewInput?: HTMLInputElement;

  constructor(
    toggleFocus: () => void,
    textInfo?: () => string,
    reviewDiv?: HTMLElement,
    reviewInput?: HTMLInputElement
  ) {
    this.enabled = false;

    this.textInfo = textInfo;
    this.toggleFocus = toggleFocus;

    this.reviewDiv = reviewDiv;
    this.reviewInput = reviewInput;
  }

  public toggle(): void {
    this.enabled = !this.enabled;

    if (this.enabled && this.reviewInput) {
      this.reviewDiv?.classList.remove(Constant.HIDDEN);
      this.reviewInput.value = this.textInfo ? this.textInfo() : Constant.EMPTY;
    } else {
      this.reviewDiv?.classList.add(Constant.HIDDEN);
    }

    if (this.toggleFocus) {
      this.toggleFocus();
    }
  }
}
