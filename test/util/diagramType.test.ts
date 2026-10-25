import { afterEach, describe, expect, it } from '@jest/globals';
import { chartGuide } from '@model/abstract';
import { DiagramType, TraceType } from '@type/grammar';
import { diagramTypeGuide, diagramTypeLabel, ownDiagramType } from '@util/chartTypeLabel';
import { DEFAULT_LOCALE, setLocale, SUPPORTED_LOCALES } from '@util/i18n';
// Every dictionary is a locale pack, not part of the core, so load them all.
import '../../src/locale/all';

/**
 * The diagrams MAIDR names and explains though no layer type reads them
 * (`diagramType`), in every language it speaks.
 */

const DIAGRAMS = Object.values(DiagramType);

/** The levels of a C4 diagram, which share the C4 diagram's guide. */
const C4_LEVELS = DIAGRAMS.filter(type => type.startsWith('c4_'));

/** The diagrams with a guide of their own. */
const GUIDED = DIAGRAMS.filter(type => !C4_LEVELS.includes(type));

describe('a diagram MAIDR knows', () => {
  afterEach(() => {
    setLocale(DEFAULT_LOCALE);
  });

  describe.each(SUPPORTED_LOCALES)('%s', (locale) => {
    it('should be named, each diagram by a name of its own', () => {
      setLocale(locale);

      const names = DIAGRAMS.map(diagramTypeLabel);

      expect(names.filter(name => name.trim() === '')).toEqual([]);
      expect(new Set(names).size).toBe(DIAGRAMS.length);
    });

    it('should be explained in all three parts', () => {
      setLocale(locale);

      const incomplete = DIAGRAMS.filter((type) => {
        const guide = diagramTypeGuide(type);
        return [guide.definition, guide.purpose, guide.appearance].some(text => text.trim() === '');
      });

      expect(incomplete).toEqual([]);
    });

    // A guide copied from a neighbouring diagram, or from a layer type, would
    // pass the check above and tell the reader about the wrong chart.
    it('should be explained in words of its own', () => {
      setLocale(locale);

      const own = GUIDED.map(type => diagramTypeGuide(type).definition);
      const traces = Object.values(TraceType).map(type => chartGuide(type).definition);

      expect(new Set(own).size).toBe(GUIDED.length);
      expect(own.filter(definition => traces.includes(definition))).toEqual([]);
    });
  });

  it('should explain each level of a C4 diagram as a C4 diagram', () => {
    expect(C4_LEVELS.length).toBeGreaterThan(0);
    for (const level of C4_LEVELS) {
      expect(diagramTypeGuide(level)).toEqual(diagramTypeGuide(DiagramType.C4));
    }
  });
});

describe('ownDiagramType', () => {
  it('should read a diagram type MAIDR knows, trimmed', () => {
    expect(ownDiagramType({ diagramType: DiagramType.KANBAN })).toBe(DiagramType.KANBAN);
    expect(ownDiagramType({ diagramType: ' kanban ' as DiagramType })).toBe(DiagramType.KANBAN);
  });

  it('should read nothing from a value MAIDR does not know as a diagram type', () => {
    for (const diagramType of ['Kanban', 'kanban_board', '', 7, null, undefined, {}]) {
      expect(ownDiagramType({ diagramType: diagramType as DiagramType })).toBeUndefined();
    }
    expect(ownDiagramType(undefined)).toBeUndefined();
  });
});
