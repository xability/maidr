import type { JSX } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { gene: 'TP53', log2fc: 2.4, negLog10P: 14.1 },
  { gene: 'EGFR', log2fc: 1.9, negLog10P: 6.4 },
  { gene: 'BRCA1', log2fc: -2.1, negLog10P: 8.7 },
  { gene: 'MYC', log2fc: -0.3, negLog10P: 0.8 },
  { gene: 'KRAS', log2fc: 0.6, negLog10P: 1.1 },
  { gene: 'PTEN', log2fc: -1.4, negLog10P: 4.2 },
  { gene: 'ACTB', log2fc: 0.1, negLog10P: 0.2 },
];

export function VolcanoPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Volcano Plot</h2>
      <p>
        Differential expression. The labels are the payload here — a reader
        told only "x is 2.4, y is 14.1" has been handed the two numbers they
        can already see the shape of, and withheld the gene.
      </p>
      <MaidrRecharts
        id="volcano-example"
        title="Differential Expression"
        subtitle="Tumour versus normal"
        data={data}
        chartType="volcano"
        xKey="log2fc"
        yKeys={['negLog10P']}
        volcanoConfig={{ labelKey: 'gene', significance: 1.3, effect: 1 }}
        xLabel="log2 fold change"
        yLabel="-log10(p)"
      >
        <ScatterChart width={600} height={350}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="log2fc" type="number" name="log2 fold change" />
          <YAxis dataKey="negLog10P" type="number" name="-log10(p)" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          {/* The same cutoffs declared to MAIDR, drawn for sighted readers. */}
          <ReferenceLine y={1.3} stroke="#999" strokeDasharray="4 4" />
          <ReferenceLine x={1} stroke="#999" strokeDasharray="4 4" />
          <ReferenceLine x={-1} stroke="#999" strokeDasharray="4 4" />
          <Scatter data={data} fill="#8884d8" />
        </ScatterChart>
      </MaidrRecharts>
    </div>
  );
}
