import type { JSX } from 'react';
import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [{ measure: 'Net Promoter Score', score: 73 }];

export function GaugeExample(): JSX.Element {
  return (
    <div>
      <h2>Gauge Chart</h2>
      <p>
        &quot;73&quot; is not the reading. &quot;73 out of 100, 7 below target,
        in the &lsquo;good&rsquo; band&quot; is — and a sighted reader gets all
        of it from the dial&apos;s geometry. None of it is written anywhere a
        screen reader can reach, and none of it is inferable from a{' '}
        <code>&lt;RadialBar&gt;</code>, so the range, the target and the bands
        are declared through <code>gaugeConfig</code>.
      </p>
      <MaidrRecharts
        id="gauge-example"
        title="Net Promoter Score"
        subtitle="Q3"
        data={data}
        chartType="gauge"
        xKey="measure"
        yKeys={['score']}
        gaugeConfig={{
          min: 0,
          max: 100,
          target: 80,
          bands: [
            { to: 40, label: 'poor' },
            { to: 70, label: 'ok' },
            { to: 100, label: 'good' },
          ],
        }}
      >
        <RadialBarChart
          width={400}
          height={260}
          innerRadius={90}
          outerRadius={150}
          startAngle={180}
          endAngle={0}
          data={data}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="score" fill="#8884d8" background isAnimationActive={false} />
        </RadialBarChart>
      </MaidrRecharts>
    </div>
  );
}
