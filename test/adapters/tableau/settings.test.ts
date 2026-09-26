import { parseTableauSettings } from '@adapters/tableau/settings';

/**
 * Reading the options a dashboard extension saved with its workbook.
 *
 * A setting is written once by an author and read on every load by every
 * viewer, so a mistake that parsed silently would be a wrong figure for
 * everyone with nobody watching the console. These cases pin the one promise
 * that follows: anything that is not an options object is refused *with a
 * message naming what is wrong*, and nothing else is.
 */
describe('parseTableauSettings', () => {
  it('reads a missing or blank setting as the defaults, not as an error', () => {
    expect(parseTableauSettings(undefined)).toEqual({ options: {} });
    expect(parseTableauSettings('   ')).toEqual({ options: {} });
  });

  it('reads every option the adapter takes', () => {
    const options = {
      id: 'sales',
      title: 'Sales',
      live: true,
      worksheets: ['Sales by Region', 'Trend'],
      anchorLabel: 'Open the accessible chart',
      layout: 'column',
      overrides: {
        'Sales by Region': {
          traceType: 'stacked_bar',
          x: 'Region',
          y: 'SUM(Sales)',
          z: 'Segment',
          orientation: 'horz',
          axes: { x: 'Sales (USD)', y: 'Region' },
        },
        'Trend': { title: 'Sales over time', stepDirection: 'hv' },
        'Scratch': { skip: true },
      },
    };

    expect(parseTableauSettings(JSON.stringify(options))).toEqual({ options });
  });

  it('refuses text that is not JSON, and says so', () => {
    const result = parseTableauSettings('{"title": "Sales",}');

    expect(result.options).toBeUndefined();
    expect(result.error).toMatch(/^The settings are not valid JSON/);
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"Sales"'],
    ['null', 'null'],
  ])('refuses %s where an options object belongs', (_label, raw) => {
    expect(parseTableauSettings(raw).error).toBe(
      'The settings must be a JSON object, written between { and }.',
    );
  });

  it('names a misspelt option rather than ignoring it', () => {
    expect(parseTableauSettings('{"titel": "Sales"}').error).toBe(
      'The settings object has no option "titel". The options are: id, title, live, '
      + 'worksheets, overrides, anchorLabel, layout.',
    );
  });

  it('names a misspelt override field with the worksheet it is under', () => {
    const raw = JSON.stringify({ overrides: { Sales: { tracetype: 'bar' } } });

    expect(parseTableauSettings(raw).error).toMatch(
      /^overrides\["Sales"\] has no option "tracetype"\./,
    );
  });

  it.each([
    [{ live: 'yes' }, 'live must be a boolean.'],
    [{ title: 3 }, 'title must be a string.'],
    [{ layout: 'rows' }, 'layout must be one of "grid", "column".'],
    [{ worksheets: 'Sales' }, 'worksheets must be a list of worksheet names.'],
    [{ worksheets: ['Sales', 2] }, 'worksheets must be a list of worksheet names.'],
    [{ overrides: [] }, 'overrides must be an object keyed by worksheet name.'],
    [{ overrides: { Sales: true } }, 'overrides["Sales"] must be an object.'],
    [{ overrides: { Sales: { skip: 'true' } } }, 'overrides["Sales"].skip must be a boolean.'],
    [{ overrides: { Sales: { x: 1 } } }, 'overrides["Sales"].x must be a string.'],
    [{ overrides: { Sales: { axes: 'Sales' } } }, 'overrides["Sales"].axes must be an object.'],
    [{ overrides: { Sales: { axes: { x: 1 } } } }, 'overrides["Sales"].axes.x must be a string.'],
  ])('refuses %j with a message naming the option', (options, message) => {
    expect(parseTableauSettings(JSON.stringify(options)).error).toBe(message);
  });

  it('refuses a trace type MAIDR does not have, listing the ones it does', () => {
    const raw = JSON.stringify({ overrides: { Sales: { traceType: 'stacked' } } });
    const { error } = parseTableauSettings(raw);

    expect(error).toMatch(/^overrides\["Sales"\]\.traceType must be one of /);
    expect(error).toContain('"stacked_bar"');
    expect(error).toContain('"stacked_normalized_bar"');
  });

  it('refuses an orientation the model would misread as horizontal', () => {
    // The bar model compares against 'vert' and treats anything else as
    // horizontal, so a spelled-out "vertical" would flip every bar silently.
    const raw = JSON.stringify({ overrides: { Sales: { orientation: 'vertical' } } });

    expect(parseTableauSettings(raw).error).toBe(
      'overrides["Sales"].orientation must be one of "vert", "horz".',
    );
  });

  it('refuses a step direction outside hv, vh and mid', () => {
    const raw = JSON.stringify({ overrides: { Trend: { stepDirection: 'up' } } });

    expect(parseTableauSettings(raw).error).toBe(
      'overrides["Trend"].stepDirection must be one of "hv", "vh", "mid".',
    );
  });
});
