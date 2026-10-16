/**
 * @jest-environment jsdom
 */

import type { DirectedGraphPoint } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { convert, layersOf } from './helpers';

/**
 * The other graphs (`diagrams/graphs.ts`): git graphs, C4 and architecture diagrams.
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
});
