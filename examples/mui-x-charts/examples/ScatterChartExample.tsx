import type { JSX } from 'react';
import { ScatterChart } from '@mui/x-charts/ScatterChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

const data = [
  { id: 0, x: 152, y: 48 },
  { id: 1, x: 160, y: 55 },
  { id: 2, x: 165, y: 61 },
  { id: 3, x: 170, y: 66 },
  { id: 4, x: 175, y: 72 },
  { id: 5, x: 181, y: 79 },
  { id: 6, x: 188, y: 85 },
];

export function ScatterChartExample(): JSX.Element {
  return (
    <div>
      <h2>Scatter Chart</h2>
      <p>Height against weight for seven people.</p>
      <MaidrMuiCharts id="mui-scatter" title="Height vs Weight">
        <ScatterChart
          width={600}
          height={360}
          xAxis={[{ label: 'Height (cm)', min: 145, max: 195 }]}
          yAxis={[{ label: 'Weight (kg)' }]}
          series={[{ data, label: 'People' }]}
        />
      </MaidrMuiCharts>
    </div>
  );
}
