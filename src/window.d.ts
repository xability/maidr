import {Maidr} from './model/grammar';

declare global {
  interface Window {
    maidr: Maidr;
  }
}
