import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { declarableTypes, SCHEMA, typesInBackticks } from './schemaTypes';

/**
 * `docs/BRAILLE.md` has one section per chart, and an experimental chart's
 * heading ends in `[experimental]` -- the convention `docs/SCHEMA.md` states
 * under "Trace type stability". A reader who lands on a section from a search
 * never sees the stability lists, so the heading is where the promise has to
 * be visible.
 *
 * The map below says which trace types each section covers. It is written out
 * rather than inferred from the heading text because the headings name charts
 * ("Letter-value plot", "Segmented Bar Plots"), not types. A new section fails
 * here until it is added, so its mark is a decision rather than an omission.
 */
const BRAILLE = readFileSync(resolve(__dirname, '../../docs/BRAILLE.md'), 'utf8');

const MARK = ' [experimental]';

/** Sections that describe the display rather than a chart. */
const NOT_A_CHART = new Set(['Multiline Braille Display Support']);

/** Each chart section's heading, without the mark, and the types it covers. */
const SECTION_TYPES: Record<string, string[]> = {
  'Bar plot': ['bar'],
  'Heatmap': ['heat'],
  'Box plot': ['box'],
  'Hexbin': ['hexbin'],
  'Letter-value plot (boxen)': ['boxen'],
  'Scatter plot': ['point'],
  'ROC curve': ['roc'],
  'Rug plot': ['rug'],
  'Segmented Bar Plots': ['stacked_bar', 'dodged_bar', 'stacked_normalized_bar'],
  'Violin Plot': ['violin_kde', 'violin_box'],
  'Line plot': ['line'],
  'Area plot': ['area', 'stacked_area', 'stacked_normalized_area'],
  'Error bar plot': ['error_bar'],
  'Step plot': ['step'],
  'Pie chart': ['pie'],
  'Waterfall chart': ['waterfall'],
  'Word cloud': ['word_cloud'],
  'Gauge and bullet chart': ['gauge'],
  'Dumbbell': ['dumbbell'],
  'Radar and polar area': ['radar', 'polar_area'],
  'Funnel': ['funnel'],
  'Gantt, timeline and swimlane': ['gantt'],
  'Parallel coordinates': ['parallel_coordinates'],
  'Bump chart': ['bump'],
  'Diverging bar and population pyramid': ['diverging_bar'],
  'Ridgeline (joy plot)': ['ridgeline'],
  'Forest plot': ['forest'],
  'Kaplan-Meier survival curve': ['survival'],
  'Mosaic and marimekko': ['mosaic'],
  'Choropleth': ['choropleth'],
  'Contour and filled contour': ['contour'],
  'Sankey, alluvial and chord': ['sankey', 'alluvial', 'chord'],
  'Network': ['network'],
  'Treemap': ['treemap'],
  'Sunburst and icicle': ['sunburst', 'icicle'],
  'Volcano and Manhattan': ['volcano', 'manhattan'],
};

/** The `##` headings, plus the `###` one that is a chart of its own. */
function chartHeadings(): string[] {
  return BRAILLE.split('\n')
    .filter(line => line.startsWith('## ') || line.startsWith('### Sunburst'))
    .map(line => line.replace(/^#+ /, ''))
    .filter(heading => !NOT_A_CHART.has(heading));
}

/** The experimental list in `docs/SCHEMA.md`. */
function experimentalTypes(): Set<string> {
  const start = SCHEMA.indexOf('### Experimental\n');
  const rest = SCHEMA.slice(start + '### Experimental\n'.length);
  return new Set(typesInBackticks(rest.slice(0, rest.indexOf('\n#'))));
}

describe('docs/BRAILLE.md experimental marks', () => {
  test('knows which types every chart section covers', () => {
    const unknown = chartHeadings()
      .map(heading => heading.replace(MARK, ''))
      .filter(heading => !(heading in SECTION_TYPES));

    expect(unknown).toEqual([]);
  });

  test('names only declarable types', () => {
    const declarable = new Set(declarableTypes());
    const stray = Object.values(SECTION_TYPES).flat().filter(type => !declarable.has(type));

    expect(stray).toEqual([]);
  });

  test('marks a section exactly when every type it covers is experimental', () => {
    const experimental = experimentalTypes();
    const wrong = chartHeadings().filter((heading) => {
      const types = SECTION_TYPES[heading.replace(MARK, '')] ?? [];
      const expected = types.length > 0 && types.every(type => experimental.has(type));
      return heading.endsWith(MARK) !== expected;
    });

    expect(wrong).toEqual([]);
  });
});
