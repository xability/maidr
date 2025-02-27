import type { Maidr } from '@type/maidr';

declare global {
  interface Window {
    maidr: Maidr;
  }
}
