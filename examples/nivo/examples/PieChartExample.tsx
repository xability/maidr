import type { JSX } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

const data = [
  { id: 'Chrome', label: 'Chrome', value: 64 },
  { id: 'Safari', label: 'Safari', value: 19 },
  { id: 'Edge', label: 'Edge', value: 5 },
  { id: 'Firefox', label: 'Firefox', value: 3 },
  { id: 'Other', label: 'Other', value: 9 },
];

export function PieChartExample(): JSX.Element {
  return (
    <div>
      <h2>Pie Chart</h2>
      <p>Pie chart of browser market share.</p>
      <MaidrNivo
        id="nivo-pie"
        title="Browser Market Share"
        subtitle="Percent of page views"
        type="pie"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsivePie
            data={data}
            margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
            padAngle={0.7}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
