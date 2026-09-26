import type { JSX } from 'react';
import { ResponsiveBoxPlot } from '@nivo/boxplot';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

/** Deterministic pseudo-random values so the chart is the same on every load. */
function sample(group: string, center: number, spread: number, count: number): { group: string; value: number }[] {
  let seed = center * 7919;
  return Array.from({ length: count }, () => {
    seed = (seed * 9301 + 49297) % 233280;
    const value = center + ((seed / 233280) - 0.5) * 2 * spread;
    return { group, value: Math.round(value * 10) / 10 };
  });
}

const data = [
  ...sample('Morning', 22, 6, 40),
  ...sample('Afternoon', 30, 9, 40),
  ...sample('Evening', 26, 4, 40),
];

export function BoxPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Box Plot</h2>
      <p>
        Box plot of commute times. Nivo computes each box from the raw values;
        its whiskers mark the 10th and 90th percentiles, not 1.5 × IQR.
      </p>
      <MaidrNivo
        id="nivo-boxplot"
        title="Commute Time by Departure"
        type="boxplot"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsiveBoxPlot
            data={data}
            margin={{ top: 20, right: 30, bottom: 50, left: 70 }}
            padding={0.3}
            axisBottom={{ legend: 'Departure', legendPosition: 'middle', legendOffset: 36 }}
            axisLeft={{ legend: 'Minutes', legendPosition: 'middle', legendOffset: -50 }}
          />
        </div>
      </MaidrNivo>

      <h3>Horizontal</h3>
      <p>The same data with the boxes running across the page.</p>
      <MaidrNivo
        id="nivo-boxplot-horizontal"
        title="Commute Time by Departure (horizontal)"
        type="boxplot"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsiveBoxPlot
            data={data}
            layout="horizontal"
            margin={{ top: 20, right: 30, bottom: 50, left: 90 }}
            padding={0.3}
            axisBottom={{ legend: 'Minutes', legendPosition: 'middle', legendOffset: 36 }}
            axisLeft={{ legend: 'Departure', legendPosition: 'middle', legendOffset: -80 }}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
