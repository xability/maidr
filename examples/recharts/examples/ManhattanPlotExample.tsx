import type { JSX } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// `cumulative` is what the chart PLOTS — a running genomic offset that keeps
// the chromosomes side by side — while `bp` is the position worth ANNOUNCING.
// "Position 249,388,120" answers a question nobody asked, so `xKey` points at
// the per-chromosome position and the chromosome travels as `groupKey`.
const data = [
  { snp: 'rs1042522', chr: '1', bp: 154_300, cumulative: 154_300, negLog10P: 9.2 },
  { snp: 'rs2234693', chr: '1', bp: 890_450, cumulative: 890_450, negLog10P: 2.4 },
  { snp: 'rs1801133', chr: '2', bp: 88_120, cumulative: 249_388_120, negLog10P: 3.1 },
  { snp: 'rs4988235', chr: '2', bp: 610_775, cumulative: 249_910_775, negLog10P: 11.6 },
  { snp: 'rs6265', chr: '3', bp: 271_390, cumulative: 492_671_390, negLog10P: 1.8 },
  { snp: 'rs17822931', chr: '3', bp: 733_004, cumulative: 493_133_004, negLog10P: 7.9 },
];

export function ManhattanPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Manhattan Plot</h2>
      <p>
        A genome-wide association scan. MAIDR announces the SNP and its
        chromosome alongside the coordinates, and sorts every point against the
        genome-wide significance line at 7.3.
      </p>
      <MaidrRecharts
        id="manhattan-example"
        title="Genome-Wide Association"
        subtitle="-log10(p) by position"
        data={data}
        chartType="manhattan"
        xKey="bp"
        yKeys={['negLog10P']}
        volcanoConfig={{ labelKey: 'snp', groupKey: 'chr', significance: 7.3 }}
        xLabel="Position"
        yLabel="-log10(p)"
      >
        <ScatterChart width={600} height={350}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="cumulative" type="number" name="Genomic position" tick={false} />
          <YAxis dataKey="negLog10P" type="number" name="-log10(p)" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <ReferenceLine y={7.3} stroke="#999" strokeDasharray="4 4" />
          <Scatter data={data} fill="#8884d8" />
        </ScatterChart>
      </MaidrRecharts>
    </div>
  );
}
