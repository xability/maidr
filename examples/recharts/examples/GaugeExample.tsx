import type { JSX } from 'react';
import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [{ measure: 'Net Promoter Score', score: 73 }];

const MIN = 0;
const MAX = 100;
const TARGET = 80;
const BANDS = [
  { to: 40, label: 'poor', fill: '#d9796f' },
  { to: 70, label: 'ok', fill: '#e3c35f' },
  { to: 100, label: 'good', fill: '#6aae6e' },
];

// The dial's geometry, given to the chart and used to draw its marks.
const CX = 200;
const CY = 210;
const INNER = 90;
const OUTER = 150;

/**
 * Where a value sits on the dial, which runs from the minimum at 9 o'clock
 * over the top to the maximum at 3 o'clock.
 *
 * @param value - A value on the gauge's scale
 * @param radius - How far from the centre
 * @returns The point's x and y
 */
function pointAt(value: number, radius: number): [number, number] {
  const angle = Math.PI * (1 - (value - MIN) / (MAX - MIN));
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

/**
 * The ring segment between two values.
 *
 * @param from - Where the segment starts
 * @param to - Where it ends
 * @param inner - Its inner radius
 * @param outer - Its outer radius
 * @returns An SVG path
 */
function segment(from: number, to: number, inner: number, outer: number): string {
  const [x0, y0] = pointAt(from, outer);
  const [x1, y1] = pointAt(to, outer);
  const [x2, y2] = pointAt(to, inner);
  const [x3, y3] = pointAt(from, inner);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 0 0 ${x3} ${y3} Z`;
}

/**
 * The bands and the target, drawn round the dial: the facts `gaugeConfig`
 * declares, so that a sighted reader sees what MAIDR reads out.
 *
 * @returns The marks, inside the chart's own SVG
 */
function DialMarks(): JSX.Element {
  const bands = BANDS.map((band, index) => ({ ...band, from: index === 0 ? MIN : BANDS[index - 1].to }));
  const [targetX1, targetY1] = pointAt(TARGET, INNER - 4);
  const [targetX2, targetY2] = pointAt(TARGET, OUTER + 16);
  const [targetLabelX, targetLabelY] = pointAt(TARGET, OUTER + 28);
  return (
    <g className="gauge-dial-marks">
      {bands.map((band) => {
        const [labelX, labelY] = pointAt((band.from + band.to) / 2, OUTER + 22);
        return (
          <g key={band.label} className="gauge-band">
            <path d={segment(band.from, band.to, OUTER + 4, OUTER + 12)} fill={band.fill} />
            <text x={labelX} y={labelY} textAnchor="middle" fontSize={12} fill="#333">{band.label}</text>
          </g>
        );
      })}
      <g className="gauge-target">
        <line x1={targetX1} y1={targetY1} x2={targetX2} y2={targetY2} stroke="#222" strokeWidth={3} />
        <text x={targetLabelX} y={targetLabelY} textAnchor="start" fontSize={12} fill="#222">
          target
          {' '}
          {TARGET}
        </text>
      </g>
    </g>
  );
}

export function GaugeExample(): JSX.Element {
  return (
    <div>
      <h2>Gauge Chart</h2>
      <p>
        &quot;73&quot; is not the reading. &quot;73 out of 100, 7 below target,
        in the &lsquo;good&rsquo; band&quot; is — and a sighted reader gets all
        of it from the dial&apos;s geometry: the bands round its rim and the
        target mark across it. None of it is written anywhere a screen reader
        can reach, and none of it is inferable from a{' '}
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
          min: MIN,
          max: MAX,
          target: TARGET,
          bands: BANDS.map(({ to, label }) => ({ to, label })),
        }}
      >
        <RadialBarChart
          width={400}
          height={240}
          cx={CX}
          cy={CY}
          innerRadius={INNER}
          outerRadius={OUTER}
          barCategoryGap={0}
          startAngle={180}
          endAngle={0}
          data={data}
        >
          <PolarAngleAxis type="number" domain={[MIN, MAX]} tick={false} />
          <RadialBar dataKey="score" fill="#8884d8" background isAnimationActive={false} />
          <DialMarks />
        </RadialBarChart>
      </MaidrRecharts>
    </div>
  );
}
