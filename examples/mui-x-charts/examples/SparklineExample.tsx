import type { JSX } from 'react';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function SparklineExample(): JSX.Element {
  return (
    <div>
      <h2>Sparkline</h2>
      <p>A compact line of weekly sign-ups.</p>
      <MaidrMuiCharts id="mui-sparkline" title="Weekly Sign-ups">
        <SparkLineChart width={400} height={100} data={[3, 7, 4, 9, 6, 11, 8]} />
      </MaidrMuiCharts>
    </div>
  );
}
