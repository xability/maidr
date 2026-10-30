import type { JSX } from 'react';
import { SunburstChart } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// A type alias rather than an interface: only the former gets the implicit
// index signature that lets it stand in for the adapter's `data` rows.
type ChannelNode = {
  name: string;
  sessions?: number;
  children?: ChannelNode[];
};

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

/**
 * The tree with every interior node's total filled in.
 *
 * `<SunburstChart>` sizes the whole circle by the root's own `dataKey` value
 * and each arc by its own node's, so a node with no value of its own is drawn
 * at an angle of NaN: with only the leaves valued, nothing was drawn at all.
 * The adapter is still given the tree as declared; MAIDR derives the same
 * totals from the leaves.
 *
 * @param node - A node and its subtree
 * @returns A copy whose interior nodes carry the sum of their children
 */
function withTotals(node: ChannelNode): ChannelNode {
  if (node.children === undefined) {
    return node;
  }
  const children = node.children.map(withTotals);
  return { ...node, sessions: children.reduce((sum, child) => sum + (child.sessions ?? 0), 0), children };
}

export function SunburstExample(): JSX.Element {
  return (
    <div>
      <h2>Sunburst</h2>
      <p>
        The same hierarchy a treemap draws, laid out as rings. Recharts&apos;{' '}
        <code>&lt;SunburstChart&gt;</code> takes a single root object and draws
        that root&apos;s <strong>children</strong>, so those children are what
        the adapter is given — the declared nodes are then exactly the drawn
        ones, and highlighting lines up ring by ring.
      </p>
      <MaidrRecharts
        id="sunburst-example"
        title="Sessions by Channel"
        data={nodes}
        chartType="sunburst"
        xKey="name"
        yKeys={['sessions']}
      >
        <SunburstChart
          width={420}
          height={420}
          data={withTotals({ name: 'All traffic', children: nodes })}
          dataKey="sessions"
        />
      </MaidrRecharts>
    </div>
  );
}
