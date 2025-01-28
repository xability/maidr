import {Maidr} from '../../model/grammar';
import {convertSVGtoBase64} from '../../util/image';

export default class FrontendManager {
  public execute: (key: string) => void = () => {};
  public maidrJson = '';
  public image = '';

  constructor(maidr: Maidr) {
    this.maidrJson = JSON.stringify(maidr);
    console.log(this.maidrJson);
    this.setImage(maidr.id);
  }

  private async setImage(id: string): Promise<void> {
    const svgElement = document.getElementById(id);
    this.image = await convertSVGtoBase64(svgElement);
    console.log(this.image);
  }

  public setFrontendKeyMap(callback: (key: string) => void): void {
    this.execute = callback;
  }
}
