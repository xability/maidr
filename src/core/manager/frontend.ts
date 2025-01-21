import {Command} from '../command/command';

export default class FrontendManager {
  private keyMaps: {[key: string]: Command} = {};
  public execute: (key: string) => void = () => {};

  public setFrontendKeyMap(callback: (key: string) => void): void {
    this.execute = callback;
  }

  public executeShortcut(key: string): void {
    this.keyMaps[key].execute();
  }
  setKeyMap(keyMaps: {[key: string]: Command}) {
    this.keyMaps = keyMaps;
  }
}
