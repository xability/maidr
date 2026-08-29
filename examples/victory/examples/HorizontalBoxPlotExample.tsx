import type { JSX } from 'react';
import { VictoryAxis, VictoryBoxPlot, VictoryChart } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// The same summaries the upright example uses, drawn on their side.
//
// `horizontal` may sit on the chart, as here, or on the box plot itself;
// either way MAIDR announces a horizontal box plot and reads it against the
// axes as drawn — the group off the y axis, the measurement off the x. The
// five numbers do not move with it: a box carries no `x`/`y` pair to exchange,
// unlike a bar.
const data = [
  { x: 'A', min: 2, q1: 5, median: 8, q3: 12, max: 16 },
  { x: 'B', min: 4, q1: 7, median: 10, q3: 14, max: 20 },
  { x: 'C', min: 1, q1: 4, median: 6, q3: 9, max: 13 },
];

export function HorizontalBoxPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Box Plot (horizontal)</h2>
      <p>
        The same distribution with its groups running down the page. Left and
        right move through one group's sections; up and down move between the
        groups.
      </p>
      <MaidrVictory
        id="victory-box-horizontal"
        title="Distribution by Group"
      >
        <VictoryChart domainPadding={24} horizontal>
          <VictoryAxis label="Group" />
          <VictoryAxis dependentAxis label="Value" />
          <VictoryBoxPlot data={data} boxWidth={20} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
