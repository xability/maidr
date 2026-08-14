import type { JSX } from 'react';
import { ComposedChart, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { country: 'Japan', share: 12 },
  { country: 'Brazil', share: 8 },
  { country: 'Germany', share: 15 },
  { country: 'India', share: 21 },
  { country: 'Canada', share: 6 },
];

export function LollipopExample(): JSX.Element {
  return (
    <div>
      <h2>Lollipop Chart</h2>
      <p>Lollipop chart showing market share by country.</p>
      <MaidrRecharts
        id="lollipop-example"
        title="Market Share by Country"
        subtitle="Stem and head"
        data={data}
        chartType="lollipop"
        xKey="country"
        yKeys={['share']}
        xLabel="Country"
        yLabel="Share (%)"
      >
        <ComposedChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="country" />
          <YAxis />
          <Tooltip />
          {/* A thin bar is the stem; the scatter is the head, and the head is
              what MAIDR highlights — it is where the value is read off. */}
          <Bar dataKey="share" barSize={2} fill="#8884d8" />
          <Scatter dataKey="share" fill="#8884d8" />
        </ComposedChart>
      </MaidrRecharts>
    </div>
  );
}
