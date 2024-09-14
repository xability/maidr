import {Maidr} from './core/maidr';

declare global {
  interface Window {
    maidr: Maidr;
  }
}
