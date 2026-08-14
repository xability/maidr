import type { JSX } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { country: 'Japan', then: 78.9, now: 84.6 },
  { country: 'Spain', then: 76.9, now: 83.2 },
  { country: 'Korea', then: 71.7, now: 83.5 },
  { country: 'United States', then: 75.3, now: 77.3 },
  { country: 'Russia', then: 69.2, now: 68.9 },
];

/** The pair a floating `<Bar>` draws a connector between. */
function span(row: unknown): [number, number] {
  const point = row as { then: number; now: number };
  return [point.then, point.now];
}

export function DumbbellExample(): JSX.Element {
  return (
    <div>
      <h2>Dumbbell Chart</h2>
      <p>
        Life expectancy in 1990 against 2020. The two ends are named through{' '}
        <code>fillKeys</code>, and those names are the whole content of the
        comparison — announced as &quot;start&quot; and &quot;end&quot;, a
        reader is told which dot they are on and not which year it is. MAIDR
        derives the change rather than reading it, so Russia is announced as a
        decrease without anything extra declared.
      </p>
      <MaidrRecharts
        id="dumbbell-example"
        title="Life Expectancy, 1990 against 2020"
        data={data}
        chartType="dumbbell"
        xKey="country"
        yKeys={['then', 'now']}
        fillKeys={['1990', '2020']}
        xLabel="Country"
        yLabel="Years"
      >
        <BarChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="country" />
          <YAxis domain={[60, 90]} />
          <Tooltip />
          <Bar dataKey={span} barSize={6} fill="#8884d8" isAnimationActive={false} />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
