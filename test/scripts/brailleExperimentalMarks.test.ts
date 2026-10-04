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
 *
 * The sections are also not interleaved: every stable chart sits under
 * `## Stable chart types` and every experimental one under the
 * `## Experimental chart types` that follows it, so the stable part can be
 * read without wading through the prototypes.
 */
const BRAILLE = readFileSync(resolve(__dirname, '../../docs/BRAILLE.md'), 'utf8');

const MARK = ' [experimental]';

const STABLE_GROUP = '## Stable chart types';
const EXPERIMENTAL_GROUP = '## Experimental chart types';

/** Each chart section's heading, without the mark, and the types it covers. */
const SECTION_TYPES: Record<string, string[]> = {
  'Bar plot': ['bar'],
  'Heatmap': ['heat'],
  'Box plot': ['box'],
  'Hexbin': ['hexbin'],
  'Letter-value plot (boxen)': ['boxen'],
  'Scatter plot': ['point'],
  'Precision-recall curve': ['pr_curve'],
  'ROC curve': ['roc'],
  'Percentile band (fan chart)': ['percentile_band'],
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

/** A chart section's heading, and which of the two groups it sits under. */
interface ChartHeading {
  heading: string;
  group: 'stable' | 'experimental';
}

/**
 * The `###` headings under the two groups, plus the `####` one that is a chart
 * of its own. Empty when either group heading is missing or they are out of
 * order, so a flattened document fails the counts below rather than passing
 * with nothing to check.
 */
function chartSections(): ChartHeading[] {
  const lines = BRAILLE.split('\n');
  const stable = lines.indexOf(STABLE_GROUP);
  const experimental = lines.indexOf(EXPERIMENTAL_GROUP);
  if (stable < 0 || experimental < stable)
    return [];
  const end = lines.findIndex((line, i) => i > experimental && line.startsWith('## '));
  return lines
    .slice(stable + 1, end < 0 ? lines.length : end)
    .map((line, i) => ({ line, at: stable + 1 + i }))
    .filter(({ line }) => line.startsWith('### ') || line.startsWith('#### Sunburst'))
    .map(({ line, at }) => ({
      heading: line.replace(/^#+ /, ''),
      group: at > experimental ? 'experimental' : 'stable',
    }));
}

function chartHeadings(): string[] {
  return chartSections().map(section => section.heading);
}

/** The experimental list in `docs/SCHEMA.md`. */
function experimentalTypes(): Set<string> {
  const start = SCHEMA.indexOf('### Experimental\n');
  const rest = SCHEMA.slice(start + '### Experimental\n'.length);
  return new Set(typesInBackticks(rest.slice(0, rest.indexOf('\n#'))));
}

describe('docs/BRAILLE.md experimental marks', () => {
  test('finds the chart sections in both groups', () => {
    const sections = chartSections();

    expect(sections.filter(section => section.group === 'stable').length).toBeGreaterThanOrEqual(9);
    expect(sections.filter(section => section.group === 'experimental').length).toBeGreaterThanOrEqual(27);
  });

  test('covers every chart section the map knows', () => {
    const found = new Set(chartHeadings().map(heading => heading.replace(MARK, '')));
    const missing = Object.keys(SECTION_TYPES).filter(heading => !found.has(heading));

    expect(missing).toEqual([]);
  });

  test('puts every stable chart before the experimental group and every experimental one after it', () => {
    const misplaced = chartSections()
      .filter(section => section.heading.endsWith(MARK) !== (section.group === 'experimental'))
      .map(section => `${section.group}: ${section.heading}`);

    expect(misplaced).toEqual([]);
  });

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
