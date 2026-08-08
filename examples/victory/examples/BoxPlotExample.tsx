import type { JSX } from 'react';
import { VictoryAxis, VictoryBoxPlot, VictoryChart } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// Pre-computed statistics. The adapter reads these directly; it does not
// derive quartiles from raw arrays. Highlighting is intentionally skipped
// for box plots (audio, text, and braille still work).
const data = [
  { x: 'A', min: 2, q1: 5, median: 8, q3: 12, max: 16 },
  { x: 'B', min: 4, q1: 7, median: 10, q3: 14, max: 20 },
  { x: 'C', min: 1, q1: 4, median: 6, q3: 9, max: 13 },
];

export function BoxPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Box Plot</h2>
      <p>Box plot from pre-computed quartile statistics.</p>
      <MaidrVictory
        id="victory-box"
        title="Distribution by Group"
      >
        <VictoryChart domainPadding={24}>
          <VictoryAxis label="Group" />
          <VictoryAxis dependentAxis label="Value" />
          <VictoryBoxPlot data={data} boxWidth={20} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
