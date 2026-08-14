import type { JSX } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// One row per distribution, carrying the letter-value ladder computed from the
// raw sample. `p` is the TAIL probability: 0.25 is the rung spanning the middle
// half, 0.125 the middle three quarters, and so on outwards. A box plot is this
// shape with exactly one rung, and that fixed depth is why it cannot express a
// large sample's tails.
const distributions = [
  {
    region: 'East',
    median: 180,
    levels: [
      { p: 0.25, lo: 150, hi: 240 },
      { p: 0.125, lo: 130, hi: 310 },
      { p: 0.0625, lo: 110, hi: 420 },
    ],
    slow: [820, 910],
  },
  {
    region: 'West',
    median: 210,
    levels: [
      { p: 0.25, lo: 175, hi: 260 },
      { p: 0.125, lo: 150, hi: 330 },
      { p: 0.0625, lo: 120, hi: 450 },
    ],
    fast: [40],
  },
  {
    region: 'North',
    median: 150,
    levels: [
      { p: 0.25, lo: 130, hi: 185 },
      { p: 0.125, lo: 115, hi: 240 },
      { p: 0.0625, lo: 95, hi: 330 },
    ],
  },
];

/** The ladder walked outward from the median, which is the order it is drawn in. */
function positionsOf(row: (typeof distributions)[number]): number[] {
  const outward = [...row.levels].sort((a, b) => a.p - b.p);
  return [
    ...outward.map(level => level.lo),
    row.median,
    ...[...outward].reverse().map(level => level.hi),
  ];
}

const segmentCount = positionsOf(distributions[0]).length - 1;

// Recharts has no box primitive at all, so the rungs are stacked <Bar>s over a
// transparent base: one segment per gap between consecutive ladder positions.
const drawn = distributions.map((row) => {
  const positions = positionsOf(row);
  const bar: Record<string, number | string> = { region: row.region, base: positions[0] };
  for (let i = 0; i < positions.length - 1; i++) {
    bar[`seg${i}`] = positions[i + 1] - positions[i];
  }
  return bar;
});

/** How far a segment sits from the median, as a shade. */
const shades = ['#dcdcf0', '#b3b3e0', '#8a8ad0', '#8a8ad0', '#b3b3e0', '#dcdcf0'];

export function BoxenExample(): JSX.Element {
  return (
    <div>
      <h2>Boxen (Letter-Value) Plot</h2>
      <p>
        The box plot&apos;s five-number summary generalised: a large sample gets
        more rungs, so its tails stay legible. MAIDR walks each ladder in value
        order — deepest lower quantile, inward to the median, outward again —
        and announces every position as the percentile it actually is. Where the
        pitch jumps is where the sample is thin.
      </p>
      <p>
        The rungs are stacked bars here, so no class name identifies a
        distribution: the chart names its central segment and passes that as
        <code>selectorOverride</code>
        {' '}
        to get one highlight per region.
      </p>
      <MaidrRecharts
        id="boxen-example"
        title="Response Time by Region"
        subtitle="Letter-value summary of 40,000 requests"
        data={distributions}
        chartType="boxen"
        xKey="region"
        boxenConfig={{ lowerOutliersKey: 'fast', upperOutliersKey: 'slow' }}
        selectorOverride="#maidr-article-boxen-example .boxen-centre .recharts-rectangle"
        xLabel="Region"
        yLabel="Response time (ms)"
      >
        <BarChart width={600} height={350} data={drawn}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="region" />
          <YAxis domain={[0, 500]} />
          <Tooltip />
          {/* The transparent base lifts the stack off the axis to the deepest
              lower quantile; every visible segment above it is one rung gap. */}
          <Bar dataKey="base" stackId="ladder" fill="transparent" isAnimationActive={false} />
          {Array.from({ length: segmentCount }, (_, index) => (
            <Bar
              key={index}
              dataKey={`seg${index}`}
              stackId="ladder"
              fill={shades[index]}
              stroke="#4a4a80"
              // One rectangle per region, right at the centre of the
              // distribution — the one mark that can stand for the whole of it.
              className={index === segmentCount / 2 ? 'boxen-centre' : undefined}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
