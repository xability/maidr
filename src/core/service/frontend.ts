export default class FrontendService {
  public execute: (key: string) => void = () => {};

  public setFrontendKeyMap(callback: (key: string) => void): void {
    console.log("setFrontendKeyMap");
    this.execute = callback;
  }
}
