import type { JSX } from 'react';
import { Treemap } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// Nested `{ name, children }` — the data Recharts itself is given, not the
// adapter's usual flat rows. Interior nodes carry no value: Recharts computes
// theirs as the sum of their children, and so does MAIDR.
const nodes = [
  {
    name: 'Europe',
    children: [
      { name: 'Germany', people: 83.2 },
      { name: 'France', people: 67.4 },
      { name: 'Spain', people: 47.4 },
    ],
  },
  {
    name: 'Asia',
    children: [
      { name: 'Japan', people: 125.1 },
      { name: 'Vietnam', people: 97.5 },
      { name: 'Nepal', people: 30.0 },
    ],
  },
  {
    name: 'Americas',
    children: [
      { name: 'Canada', people: 38.2 },
      { name: 'Peru', people: 33.7 },
    ],
  },
];

export function TreemapExample(): JSX.Element {
  return (
    <div>
      <h2>Treemap</h2>
      <p>
        The tree navigates <strong>as a tree</strong>, on the arrow keys that
        already exist: up returns to the parent, down enters the first child,
        left and right walk the siblings. Each node is announced with its exact
        share of its parent — the comparison the rectangles are drawn to
        support, and the one the eye estimates worst.
      </p>
      <MaidrRecharts
        id="treemap-example"
        title="Population by Region"
        subtitle="Millions"
        data={nodes}
        chartType="treemap"
        xKey="name"
        yKeys={['people']}
      >
        <Treemap
          width={600}
          height={350}
          data={nodes}
          dataKey="people"
          nameKey="name"
          stroke="#fff"
          fill="#8884d8"
          isAnimationActive={false}
        />
      </MaidrRecharts>
    </div>
  );
}
