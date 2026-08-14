import type { JSX } from 'react';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const months = ['Jan', 'Apr', 'Jul', 'Oct'];

/**
 * A stand-in for a kernel density estimate: a normal bump per month, sampled
 * over a shared temperature grid. A real chart computes this with a KDE — the
 * point is that it happens OUTSIDE both Recharts and the adapter.
 *
 * @param centre - Where the month's distribution peaks
 * @param spread - Its standard deviation
 * @returns The sampled density
 */
function densityCurve(centre: number, spread: number): { temp: number; density: number }[] {
  const samples: { temp: number; density: number }[] = [];
  for (let temp = -15; temp <= 35; temp += 2.5) {
    const z = (temp - centre) / spread;
    samples.push({ temp, density: Math.exp(-0.5 * z * z) / (spread * Math.sqrt(2 * Math.PI)) });
  }
  return samples;
}

const shapes = [
  { month: 'Jan', centre: -2, spread: 5 },
  { month: 'Apr', centre: 9, spread: 4.5 },
  { month: 'Jul', centre: 22, spread: 4 },
  { month: 'Oct', centre: 11, spread: 5.5 },
];

// One row per sample. `density` is the curve's own height; `plotted` is that
// height with the ridge's offset added, and is what the <Area> draws. Only the
// first of the two is data — the offset exists so the curves do not overlap
// illegibly, and says nothing about any month.
const samples = shapes.flatMap(({ month, centre, spread }, index) =>
  densityCurve(centre, spread).map(sample => ({
    month,
    temp: sample.temp,
    density: sample.density,
    plotted: sample.density + (shapes.length - 1 - index) * 0.09,
  })));

export function RidgelineExample(): JSX.Element {
  return (
    <div>
      <h2>Ridgeline (Joy) Plot</h2>
      <p>
        One temperature distribution per month, the curves offset down the page
        so their shapes can be compared. Arrow up and down to move between
        months at the same temperature — the comparison the chart exists for.
        MAIDR is given each curve WITHOUT its offset, so a low ridge is not
        heard as a loud one.
      </p>
      <MaidrRecharts
        id="ridgeline-example"
        title="Daily Temperature by Month"
        subtitle="Kernel density, Chicago"
        data={samples}
        chartType="ridgeline"
        xKey="temp"
        ridgelineConfig={{ groupKey: 'month', valueKey: 'temp', densityKey: 'density' }}
        xLabel="Temperature (C)"
        yLabel="Month"
      >
        <AreaChart width={600} height={350}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="temp" type="number" domain={[-15, 35]} />
          <YAxis type="number" tickFormatter={() => ''} />
          <Tooltip />
          {/* One <Area> per group, declared in the order the months first
              appear in the data — which is the order MAIDR announces them in,
              and therefore the order the highlight resolves in. */}
          {months.map((month, index) => (
            <Area
              key={month}
              data={samples.filter(sample => sample.month === month)}
              dataKey="plotted"
              name={month}
              type="monotone"
              stroke="#333"
              fill={['#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'][index]}
              fillOpacity={0.85}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </MaidrRecharts>
    </div>
  );
}
