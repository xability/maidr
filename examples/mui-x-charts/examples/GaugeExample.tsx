import type { JSX } from 'react';
import { Gauge } from '@mui/x-charts/Gauge';
import { MaidrMuiCharts } from '../../../src/adapters/mui-x-charts/MaidrMuiCharts';

export function GaugeExample(): JSX.Element {
  return (
    <div>
      <h2>Gauge</h2>
      <p>Storage used out of 100 GB.</p>
      <MaidrMuiCharts id="mui-gauge" title="Storage Used">
        <Gauge width={250} height={200} value={72} valueMin={0} valueMax={100} />
      </MaidrMuiCharts>
    </div>
  );
}
