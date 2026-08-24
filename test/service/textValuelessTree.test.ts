import type { NotificationService } from '@service/notification';
import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { TreemapTrace } from '@model/treemap';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * How a tree with no magnitude anywhere is announced (#1153).
 *
 * `TraceType.TREEMAP` is the grammar's only hierarchy, and `TreemapPoint.y`
 * is optional so that an interior node can take the sum of its children. A
 * tree in which *no* node declares one was not expressible: the trace
 * announced a value clause and derived shares from it either way, and both
 * spellings said something the chart does not draw.
 *
 * Measured on a six-node org tree before the fix:
 *
 *   omitting y everywhere    every node announced `0`, over a
 *                            `freq { min: 0, max: 0 }` that leaves no pitch
 *                            range, so the whole tree sounded flat
 *   declaring y: 1 everywhere  strictly worse -- Bo announced as 100% of
 *                            Ada, and so was Cy, two siblings each reported
 *                            as the whole of their parent
 *
 * What a reader wants from a pure hierarchy was already right: the
 * navigation, the ancestry, and whether there is anything below. The single
 * thing in the way was that every node also claimed a magnitude.
 *
 * These tests cover the announcement rather than the state, because the
 * state's omission only helps if the service renders around it.
 */

/** Minimal NotificationService stub whose notify is a jest mock. */
function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

/** The text a service emits for one trace state, in the current text mode. */
function announce(text: TextService, state: TraceState): string {
  const changeListener = jest.fn();
  const disposable = text.onChange(changeListener);

  text.update(state);
  disposable.dispose();
  const event = changeListener.mock.calls[0][0] as { value: string };
  return event.value;
}

/**
 * Ada reports to nobody; Bo and Cy report to Ada; three functions below them.
 *
 * No `y` anywhere, which is what a Highcharts organization chart declares:
 * measured, every node's `value` and `weight` came back null.
 */
const ORG: TreemapPoint[] = [
  { x: 'Ada' },
  { x: 'Bo', path: ['Ada'] },
  { x: 'Cy', path: ['Ada'] },
  { x: 'Engineering', path: ['Ada', 'Bo'] },
  { x: 'Design', path: ['Ada', 'Bo'] },
  { x: 'Finance', path: ['Ada', 'Cy'] },
];

/** The same shape with magnitudes, so the ordinary reading stays visible. */
const VALUED: TreemapPoint[] = [
  { x: 'Ada', y: 6 },
  { x: 'Bo', y: 4, path: ['Ada'] },
  { x: 'Cy', y: 2, path: ['Ada'] },
];

/** Builds a treemap layer over the given nodes. */
function treeLayer(data: TreemapPoint[]): MaidrLayer {
  return {
    id: 'org',
    type: TraceType.TREEMAP,
    title: 'Reporting lines',
    axes: { x: { label: 'Person' }, y: { label: 'Headcount' } },
    data,
  };
}

describe('announcing a tree that declares no magnitude', () => {
  test('names the node and says nothing about a value', () => {
    const trace = new TreemapTrace(treeLayer(ORG));
    const text = new TextService(createMockNotificationService());

    const spoken = announce(text, trace.getStateAt(0, 0));

    expect(spoken).toBe('Person is Ada, Children is 2');
  });

  test('does not announce the axis it has no reading on', () => {
    // The defect: `Headcount is 0` on every node of a chart that draws no
    // headcount. The label goes with the value -- a bare "Headcount" with
    // nothing after it would be worse than silence.
    const trace = new TreemapTrace(treeLayer(ORG));
    const text = new TextService(createMockNotificationService());

    const spoken = announce(text, trace.getStateAt(0, 0));

    expect(spoken).not.toContain('Headcount');
    expect(spoken).not.toContain('0');
  });

  test('claims no share of a parent that has nothing to share', () => {
    // The other spelling's failure, and the worse one: declaring the
    // layout's per-link 1 made Bo 100% of Ada, and Cy 100% of Ada as well.
    const trace = new TreemapTrace(treeLayer(ORG));
    const text = new TextService(createMockNotificationService());

    const bo = announce(text, trace.getStateAt(1, 0));
    const cy = announce(text, trace.getStateAt(1, 1));

    expect(bo).not.toContain('%');
    expect(cy).not.toContain('%');
    expect(bo).toContain('Bo');
    expect(cy).toContain('Cy');
  });

  test('still gives the reader the ancestry and what is below', () => {
    // The content that was always correct, and the reason reading an org
    // chart this way beats the nothing it gets otherwise.
    const trace = new TreemapTrace(treeLayer(ORG));
    const text = new TextService(createMockNotificationService());

    const spoken = announce(text, trace.getStateAt(2, 0));

    expect(spoken).toContain('Engineering');
    expect(spoken).toContain('Ada > Bo');
  });

  test('says nothing on the axis in terse mode either', () => {
    const trace = new TreemapTrace(treeLayer(ORG));
    const text = new TextService(createMockNotificationService());
    // Verbose is the default; one toggle reaches terse.
    text.toggle();

    const spoken = announce(text, trace.getStateAt(0, 0));

    expect(spoken).not.toContain('0');
    expect(spoken).toContain('Ada');
  });

  test('a tree that does declare magnitudes is untouched', () => {
    const trace = new TreemapTrace(treeLayer(VALUED));
    const text = new TextService(createMockNotificationService());

    const spoken = announce(text, trace.getStateAt(1, 0));

    expect(spoken).toContain('Headcount is 4');
    expect(spoken).toContain('Share of Ada is 66.7%');
  });

  test('one declared magnitude is enough to make the tree a valued one', () => {
    // A mixed tree is the documented ordinary case -- an interior node
    // summing its children -- and must not be caught by this.
    const partial: TreemapPoint[] = [
      { x: 'Ada' },
      { x: 'Bo', y: 4, path: ['Ada'] },
      { x: 'Cy', path: ['Ada'] },
    ];
    const trace = new TreemapTrace(treeLayer(partial));
    const text = new TextService(createMockNotificationService());

    expect(announce(text, trace.getStateAt(1, 0))).toContain('Headcount is 4');
    expect(announce(text, trace.getStateAt(0, 0))).toContain('Headcount is 4');
  });
});
