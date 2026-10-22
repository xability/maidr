/**
 * @jest-environment jsdom
 */

import type { DirectedGraphTrace } from '@model/directedGraph';
import type { DirectedGraphPoint } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { convert, layersOf } from './helpers';

/**
 * The other graphs (`diagrams/graphs.ts`): git graphs, C4, architecture and event modeling diagrams.
 *
 * Stand-in databases shaped as Mermaid 12's; see `./helpers`.
 */

describe('the other graphs', () => {
  it('reads a git graph\'s commits by their messages and parents', () => {
    const data = layersOf(convert('gitGraph', {
      getCommitsArray: () => [
        { id: 'init', seq: 0, type: 0, parents: [], branch: 'main', tags: [] },
        { id: '1-abcdef0', seq: 1, type: 0, parents: ['init'], branch: 'dev', tags: ['v1'], message: '' },
        { id: '2-1234567', seq: 2, type: 3, parents: ['init', '1-abcdef0'], branch: 'main', tags: [], message: 'merged branch dev into main' },
      ],
    }))[0].data as DirectedGraphPoint[];
    expect(data.map(point => point.label ?? point.id)).toEqual(['init', 'commit 2', 'merged branch dev into main']);
    expect(data[1]).toMatchObject({ path: ['dev'], attributes: { Tags: 'v1' } });
    expect(data[2]).toMatchObject({ inputs: ['init', '1-abcdef0'], attributes: { Type: 'merge' } });
  });

  it('reads C4 elements in their boundaries, a two-way relationship both ways', () => {
    const data = layersOf(convert('c4', {
      getBoundaries: (parent: string) => (parent === 'global' ? [{ alias: 'b0', label: { text: 'Bank' }, type: { text: 'ENTERPRISE' } }] : []),
      getC4ShapeArray: () => [
        { alias: 'user', label: { text: 'User' }, typeC4Shape: { text: 'person' }, parentBoundary: 'b0' },
        { alias: 'app', label: { text: 'App' }, typeC4Shape: { text: 'external_system' }, techn: { text: 'Java' } },
      ],
      getRels: () => [{ type: 'birel', from: 'user', to: 'app', label: { text: 'Uses' }, techn: { text: 'HTTPS' } }],
    }))[0].data as DirectedGraphPoint[];
    expect(data[0]).toMatchObject({ label: 'User', path: ['Bank (enterprise)'], inputs: ['app'], inputLabels: ['Uses [HTTPS]'] });
    expect(data[1]).toMatchObject({ attributes: { Type: 'external system', Technology: 'Java' }, inputs: ['user'] });
  });

  it('reads an architecture connection the way its arrow points', () => {
    const data = layersOf(convert('architecture', {
      getGroups: () => [{ id: 'api', title: 'API' }],
      getServices: () => [{ id: 'db', title: 'Database', in: 'api', icon: 'database' }, { id: 'web', title: 'Web' }],
      getJunctions: () => [],
      getEdges: () => [{ lhsId: 'db', rhsId: 'web', lhsInto: true, rhsInto: false }],
    }))[0].data as DirectedGraphPoint[];
    expect(data[0]).toMatchObject({ label: 'Database', path: ['API'], inputs: ['web'] });
  });

  it('reads an architecture connection with no arrow, or an arrow at each end, both ways', () => {
    const data = layersOf(convert('architecture', {
      getGroups: () => [],
      getServices: () => ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id })),
      getJunctions: () => [],
      getEdges: () => [
        { lhsId: 'a', rhsId: 'b', lhsInto: false, rhsInto: false },
        { lhsId: 'c', rhsId: 'd', lhsInto: true, rhsInto: true, title: 'sync' },
        { lhsId: 'e', rhsId: 'f', lhsInto: false, rhsInto: true },
      ],
    }))[0].data as DirectedGraphPoint[];

    const [a, b, c, d, e, f] = data;

    expect(a.inputs).toEqual(['b']);
    expect(b.inputs).toEqual(['a']);
    expect(c).toMatchObject({ inputs: ['d'], inputLabels: ['sync'] });
    expect(d).toMatchObject({ inputs: ['c'], inputLabels: ['sync'] });
    expect(e.inputs).toBeUndefined();
    expect(f.inputs).toEqual(['e']);
  });

  // A plain line is declared as an edge each way, since a directed graph has
  // no edge without a direction, so the example's three connections are
  // counted as four, its plain line as a cycle, and Database as a merge point.
  // docs/mermaid.md says so. This turns red when the schema can declare an
  // undirected link: delete the pin and that paragraph then.
  it.failing('counts a connection drawn as a plain line once, as it is drawn', () => {
    const layer = layersOf(convert('architecture', {
      getGroups: () => [{ id: 'api', title: 'API' }],
      getServices: () => [
        { id: 'gateway', title: 'Gateway' },
        { id: 'server', title: 'Server', in: 'api' },
        { id: 'db', title: 'Database', in: 'api' },
        { id: 'disk', title: 'Storage', in: 'api' },
      ],
      getJunctions: () => [],
      getEdges: () => [
        { lhsId: 'gateway', rhsId: 'server', lhsInto: false, rhsInto: true },
        { lhsId: 'server', rhsId: 'db', lhsInto: false, rhsInto: true },
        { lhsId: 'disk', rhsId: 'db', lhsInto: false, rhsInto: false },
      ],
    }))[0];
    const trace = TraceFactory.create(layer) as DirectedGraphTrace;
    const edges = trace.description.stats.find(entry => entry.label === 'Number of edges')?.value;

    expect(edges).toBe(3);
  });

  it('names architecture items neutrally, so a group or a junction is not called a service', () => {
    const layer = layersOf(convert('architecture', {
      getGroups: () => [{ id: 'api', title: 'API' }],
      getServices: () => [{ id: 'web', title: 'Web' }, { id: 'db', title: 'Database', in: 'api' }],
      getJunctions: () => [{ id: 'hub', in: 'api' }],
      getEdges: () => [{ lhsId: 'web', rhsId: 'hub', lhsInto: false, rhsInto: true }],
    }))[0];

    const hub = (layer.data as DirectedGraphPoint[])[2];

    expect(layer.axes).toEqual({ x: { label: 'Element' } });
    expect(hub).toMatchObject({ id: 'hub', label: 'junction hub', path: ['API'], attributes: { Kind: 'junction' } });
  });

  it('reads an event model\'s boxes as entities, each with its frame', () => {
    const layer = layersOf(convert('eventmodeling', {
      getState: () => ({
        boxes: [
          { index: 0, text: 'CartUI', frame: { name: '01', modelEntityType: 'ui', entityIdentifier: 'CartUI' }, swimlane: { label: 'UI/Automation' } },
          { index: 1, text: 'AddItem', frame: { name: '02', modelEntityType: 'cmd', entityIdentifier: 'AddItem' }, swimlane: { label: 'Command/Read Model' } },
        ],
        relations: [{ sourceBox: { index: 0 }, targetBox: { index: 1 } }],
      }),
    }))[0];

    const [cart, add] = layer.data as DirectedGraphPoint[];

    expect(layer.axes).toEqual({ x: { label: 'Entity' } });
    expect(cart).toMatchObject({ label: 'CartUI', path: ['UI/Automation'], attributes: { Frame: '01', Type: 'UI' } });
    expect(add).toMatchObject({ inputs: ['0'], attributes: { Frame: '02', Type: 'command' } });
  });
});
