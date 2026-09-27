import type { JSX } from 'react';
import { Heatmap } from '@mui/x-charts-pro/Heatmap';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

const days = ['Mon', 'Tue', 'Wed', 'Thu'];
const times = ['Morning', 'Afternoon', 'Evening'];
const temps = [
  [12, 14, 11, 13],
  [19, 21, 18, 20],
  [15, 16, 14, 17],
];

export function HeatmapExample(): JSX.Element {
  return (
    <div>
      <h2>Heatmap (Pro)</h2>
      <p>Temperature by day and time of day.</p>
      <MaidrMuiCharts id="mui-heatmap" title="Temperature by Day and Time">
        <Heatmap
          width={600}
          height={360}
          xAxis={[{ data: days, label: 'Day' }]}
          yAxis={[{ data: times, label: 'Time of day', width: 90 }]}
          series={[{ data: temps.flatMap((row, y) => row.map((value, x) => [x, y, value] as [number, number, number])) }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
