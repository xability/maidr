import type { JSX } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

const data = [
  { id: 'Housing', label: 'Housing', value: 1500 },
  { id: 'Food', label: 'Food', value: 600 },
  { id: 'Transport', label: 'Transport', value: 350 },
  { id: 'Savings', label: 'Savings', value: 500 },
  { id: 'Leisure', label: 'Leisure', value: 250 },
];

export function DonutChartExample(): JSX.Element {
  return (
    <div>
      <h2>Donut Chart</h2>
      <p>
        Donut chart of a monthly budget: a Nivo pie with an
        {' '}
        <code>innerRadius</code>
        .
      </p>
      <MaidrNivo
        id="nivo-donut"
        title="Monthly Budget"
        subtitle="US dollars"
        type="pie"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsivePie
            data={data}
            margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
            innerRadius={0.5}
            padAngle={0.7}
            cornerRadius={3}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
