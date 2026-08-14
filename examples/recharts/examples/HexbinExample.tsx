import type { JSX } from 'react';
import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// One row per OCCUPIED bin, its centre in DATA units. The binning happens
// before the chart is drawn — Recharts only places the marks — and the rows
// arrive in lattice order: bottom row first, each row left to right. Note the
// half-cell stagger between rows, which is what lets hexagons tessellate and
// why a column index is not a position.
const bins = [
  { carat: 0.35, price: 800, count: 41 },
  { carat: 0.55, price: 800, count: 96 },
  { carat: 0.75, price: 800, count: 18 },
  { carat: 0.45, price: 1600, count: 27 },
  { carat: 0.65, price: 1600, count: 88 },
  { carat: 0.85, price: 1600, count: 52 },
  { carat: 1.05, price: 1600, count: 11 },
  { carat: 0.75, price: 2400, count: 14 },
  { carat: 0.95, price: 2400, count: 63 },
  { carat: 1.15, price: 2400, count: 39 },
  { carat: 1.05, price: 3200, count: 22 },
  { carat: 1.25, price: 3200, count: 31 },
];

const HEX_RADIUS = 13;

/**
 * The mark a hexbin draws. Recharts has no hexagon among its own symbol types,
 * so the bins are a `<Scatter>` given a custom `shape` — documented API, and
 * still wrapped in Recharts' own `g.recharts-shape`, which is what the
 * adapter's highlight selector targets.
 *
 * @param props - The point Recharts places, carrying its centre and its datum
 * @returns One hexagon, shaded by the bin's count
 */
function Hexagon(props: unknown): JSX.Element {
  const { cx, cy, count } = props as { cx: number; cy: number; count: number };
  const points = [0, 1, 2, 3, 4, 5]
    .map((corner) => {
      const angle = (Math.PI / 180) * (60 * corner - 30);
      return `${cx + HEX_RADIUS * Math.cos(angle)},${cy + HEX_RADIUS * Math.sin(angle)}`;
    })
    .join(' ');
  const shade = Math.min(1, count / 100);
  return <polygon points={points} fill={`rgba(64, 64, 160, ${0.2 + shade * 0.8})`} stroke="#fff" />;
}

export function HexbinExample(): JSX.Element {
  return (
    <div>
      <h2>Hexbin</h2>
      <p>
        The standard answer to an overplotted scatter: bin the points into
        hexagons and read the count. MAIDR navigates the lattice — left and
        right along a row, up and down between rows, holding the x you started
        from, because a staggered row has no bin directly above any other. Each
        bin is announced by its CENTRE rather than by a column index.
      </p>
      <MaidrRecharts
        id="hexbin-example"
        title="Carat against Price"
        subtitle="Point density"
        data={bins}
        chartType="hexbin"
        xKey="carat"
        yKeys={['price']}
        hexbinConfig={{ countKey: 'count' }}
        xLabel="Carat"
        yLabel="Price ($)"
      >
        <ScatterChart width={600} height={350} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="carat" type="number" domain={[0.2, 1.4]} name="Carat" />
          <YAxis dataKey="price" type="number" domain={[400, 3600]} name="Price" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={bins} shape={Hexagon} isAnimationActive={false} />
        </ScatterChart>
      </MaidrRecharts>
    </div>
  );
}
