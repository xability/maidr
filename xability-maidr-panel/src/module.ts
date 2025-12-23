import { PanelPlugin } from '@grafana/data';
import { MaidrPanelOptions } from './types';
import { SimplePanel } from './components/SimplePanel';

export const plugin = new PanelPlugin<MaidrPanelOptions>(SimplePanel).setPanelOptions((builder) => {
  return builder
    .addTextInput({
      path: 'title',
      name: 'Chart Title',
      description: 'Title displayed above the chart',
      defaultValue: 'Bar Chart',
    })
    .addTextInput({
      path: 'xAxisLabel',
      name: 'X-Axis Label',
      description: 'Label for the X axis',
      defaultValue: 'Category',
    })
    .addTextInput({
      path: 'yAxisLabel',
      name: 'Y-Axis Label',
      description: 'Label for the Y axis',
      defaultValue: 'Value',
    });
});
