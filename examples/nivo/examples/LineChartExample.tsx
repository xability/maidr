import type { JSX } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

const data = [
  {
    id: 'Web',
    data: [120, 180, 150, 220, 300, 260].map((y, i) => ({ x: months[i], y })),
  },
  {
    id: 'Mobile',
    data: [80, 110, 160, 190, 210, 280].map((y, i) => ({ x: months[i], y })),
  },
];

export function LineChartExample(): JSX.Element {
  return (
    <div>
      <h2>Line Chart</h2>
      <p>
        Multi-series line chart of monthly active users. Use the Up and Down
        arrow keys to move between the series.
      </p>
      <MaidrNivo
        id="nivo-line"
        title="Monthly Active Users"
        subtitle="First Half 2024"
        type="line"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsiveLine
            data={data}
            margin={{ top: 20, right: 110, bottom: 50, left: 70 }}
            pointSize={8}
            axisBottom={{ legend: 'Month', legendPosition: 'middle', legendOffset: 36 }}
            axisLeft={{ legend: 'Users (thousands)', legendPosition: 'middle', legendOffset: -60 }}
            legends={[{
              anchor: 'right',
              direction: 'column',
              translateX: 100,
              itemWidth: 80,
              itemHeight: 20,
            }]}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
