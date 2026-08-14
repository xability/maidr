import type { JSX } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// A type alias rather than an interface: only the former gets the implicit
// index signature that lets it stand in for the adapter's `data` rows.
type ChannelNode = {
  name: string;
  sessions?: number;
  children?: ChannelNode[];
};

// The hierarchy the adapter is given — the same nested shape a treemap or a
// sunburst takes. An interior node declares no value of its own: it is the sum
// of its children, and MAIDR derives it the way the layout does.
const nodes: ChannelNode[] = [
  {
    name: 'Direct',
    children: [
      { name: 'Bookmarks', sessions: 1840 },
      { name: 'Typed', sessions: 920 },
    ],
  },
  {
    name: 'Search',
    children: [
      { name: 'Organic', sessions: 3400 },
      { name: 'Paid', sessions: 1100 },
    ],
  },
  {
    name: 'Referral',
    children: [
      { name: 'Newsletters', sessions: 640 },
      { name: 'Partners', sessions: 380 },
    ],
  },
];

/** One band of the icicle: a node's span at its own depth. */
interface Band {
  name: string;
  depth: string;
  from: number;
  to: number;
}

/** A node's own value, or the sum of its children's — the layout's rule. */
function total(node: ChannelNode): number {
  return node.children
    ? node.children.reduce((sum, child) => sum + total(child), 0)
    : (node.sessions ?? 0);
}

/**
 * Lays the tree out as bands, DEPTH-FIRST PRE-ORDER.
 *
 * Recharts has no icicle, so the chart is a `<BarChart layout="vertical">` of
 * floating bars and draws one rectangle per row in row order. That order has
 * to be the order the adapter flattens the same tree in, or row i is not
 * node i and highlighting lands on somebody else's band.
 *
 * @param level - The siblings at this depth
 * @param depth - How far down they sit; the chart's lane
 * @param start - Where the first of them begins on the value axis
 * @returns The bands, in the order they must be declared
 */
function toBands(level: ChannelNode[], depth = 0, start = 0): Band[] {
  const bands: Band[] = [];
  let from = start;

  for (const node of level) {
    const to = from + total(node);
    bands.push({ name: node.name, depth: String(depth), from, to });
    if (node.children) {
      bands.push(...toBands(node.children, depth + 1, from));
    }
    from = to;
  }

  return bands;
}

const bands = toBands(nodes);

/** The span a floating `<Bar>` draws. */
function span(row: unknown): [number, number] {
  const band = row as Band;
  return [band.from, band.to];
}

export function IcicleExample(): JSX.Element {
  return (
    <div>
      <h2>Icicle Chart</h2>
      <p>
        The same hierarchy a treemap draws, laid out as depth-ordered bands.
        MAIDR navigates it <strong>as a tree</strong> on the arrow keys that
        already exist — up returns to the parent, down enters the first child,
        left and right walk the siblings — and announces each node with its
        exact share of its parent.
      </p>
      <MaidrRecharts
        id="icicle-example"
        title="Sessions by Channel"
        data={nodes}
        chartType="icicle"
        xKey="name"
        yKeys={['sessions']}
      >
        <BarChart width={600} height={300} layout="vertical" data={bands}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="depth" width={40} />
          <Tooltip />
          <Bar dataKey={span} fill="#8884d8" isAnimationActive={false} />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
