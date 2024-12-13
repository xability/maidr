import {PlotState} from '../../model/state';
import {Observer} from '../interface';

export default class ReviewManager implements Observer {
  destroy() {
    console.log('Destroy Review Method');
  }
  toggle() {
    console.log('Toggle Review Method');
  }
  update(state: PlotState): void {
    console.log('update Review Method');
  }
}
