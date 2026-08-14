import type { JSX } from 'react';
import type { WaterfallPoint } from '../../../src/type/grammar';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { useRechartsAdapter } from '../../../src/adapters/recharts/useRechartsAdapter';
import { Maidr } from '../../../src/maidr-component';

const data = [
  { step: 'Opening ARR', change: 1200, restates: true },
  { step: 'New business', change: 450 },
  { step: 'Expansion', change: 180 },
  { step: 'Contraction', change: -95 },
  { step: 'Churn', change: -210 },
  { step: 'Closing ARR', restates: true },
];

const config = {
  id: 'waterfall-example',
  title: 'ARR Bridge',
  subtitle: 'FY24',
  data,
  chartType: 'waterfall' as const,
  xKey: 'step',
  yKeys: ['change'],
  waterfallConfig: { totalKey: 'restates' },
  xLabel: 'Step',
  yLabel: 'ARR ($k)',
};

export function WaterfallExample(): JSX.Element {
  const maidrData = useRechartsAdapter(config);
  // The adapter accumulates the running totals, which is exactly what a
  // floating <Bar> needs — so the chart is drawn from them rather than
  // accumulating a second time and risking a chart that disagrees with its
  // own description.
  const steps = maidrData.subplots[0][0].layers[0].data as WaterfallPoint[];

  return (
    <div>
      <h2>Waterfall Chart</h2>
      <p>
        A step carries two numbers a bar chart would conflate: the{' '}
        <strong>contribution</strong> it made and the <strong>running total</strong>{' '}
        it produced. MAIDR sonifies the contribution — the totals of a
        waterfall drift within a narrow band, so pitching those would squash
        every step into one tone — and announces the total alongside it.
      </p>
      <Maidr data={maidrData}>
        <BarChart width={600} height={350} data={steps}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" />
          <YAxis />
          <Tooltip />
          <Bar
            dataKey={(step: unknown) => {
              const point = step as WaterfallPoint;
              return [point.start, point.end];
            }}
            fill="#8884d8"
            isAnimationActive={false}
          />
        </BarChart>
      </Maidr>
    </div>
  );
}
