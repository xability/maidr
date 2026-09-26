import type { JSX } from 'react';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

const data = [
  {
    id: 'Group A',
    data: [
      { x: 1.2, y: 3.1 },
      { x: 2.4, y: 4.0 },
      { x: 3.1, y: 5.2 },
      { x: 4.8, y: 6.1 },
      { x: 5.5, y: 7.4 },
    ],
  },
  {
    id: 'Group B',
    data: [
      { x: 1.5, y: 1.2 },
      { x: 2.2, y: 2.3 },
      { x: 3.6, y: 2.9 },
      { x: 4.1, y: 4.2 },
      { x: 5.9, y: 4.8 },
    ],
  },
];

export function ScatterPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Scatter Plot</h2>
      <p>
        Scatter plot of study hours against test score for two groups. Each
        group is its own layer; use Page Up and Page Down to switch.
      </p>
      <MaidrNivo
        id="nivo-scatter"
        title="Study Hours vs. Score"
        type="scatterplot"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsiveScatterPlot
            data={data}
            margin={{ top: 20, right: 110, bottom: 50, left: 70 }}
            nodeSize={10}
            xScale={{ type: 'linear', min: 0, max: 'auto' }}
            yScale={{ type: 'linear', min: 0, max: 'auto' }}
            axisBottom={{ legend: 'Study hours', legendPosition: 'middle', legendOffset: 36 }}
            axisLeft={{ legend: 'Score', legendPosition: 'middle', legendOffset: -50 }}
            legends={[{
              anchor: 'right',
              direction: 'column',
              translateX: 100,
              itemWidth: 80,
              itemHeight: 20,
              symbolShape: 'circle',
            }]}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
