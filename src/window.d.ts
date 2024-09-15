import {Maidr} from './plot/maidr';

declare global {
  interface Window {
    maidr: Maidr;
  }
}
