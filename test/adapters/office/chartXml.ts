/**
 * Builds DrawingML and chartEx chart parts for the Office adapter's tests,
 * written as Office writes them: every series with its cached values.
 */

const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CX = 'http://schemas.microsoft.com/office/drawing/2014/chartex';

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The cached text of a reference, as a series name or a title links to a cell. */
export function strRef(values: readonly (string | null)[], formula = 'Sheet1!$A$1'): string {
  return `<c:strRef><c:f>${formula}</c:f>${strCache(values)}</c:strRef>`;
}

/** A string cache; `null` leaves the point out, a gap. */
export function strCache(values: readonly (string | null)[]): string {
  const points = values
    .map((value, i) => (value === null ? '' : `<c:pt idx="${i}"><c:v>${escape(value)}</c:v></c:pt>`))
    .join('');
  return `<c:strCache><c:ptCount val="${values.length}"/>${points}</c:strCache>`;
}

/** A numeric reference with its cache; `null` leaves the point out, a gap. */
export function numRef(values: readonly (number | null)[], formatCode = 'General'): string {
  const points = values
    .map((value, i) => (value === null ? '' : `<c:pt idx="${i}"><c:v>${value}</c:v></c:pt>`))
    .join('');
  return `<c:numRef><c:f>Sheet1!$B$2:$B$${values.length + 1}</c:f><c:numCache><c:formatCode>${formatCode}</c:formatCode>`
    + `<c:ptCount val="${values.length}"/>${points}</c:numCache></c:numRef>`;
}

/** A multi-level category reference: levels outer first, `null` where a cell is blank. */
export function multiLevel(levels: readonly (readonly (string | null)[])[]): string {
  const count = Math.max(...levels.map(level => level.length));
  // The part lists the innermost level first.
  const written = [...levels].reverse().map(level => `<c:lvl>${level
    .map((value, i) => (value === null ? '' : `<c:pt idx="${i}"><c:v>${escape(value)}</c:v></c:pt>`))
    .join('')}</c:lvl>`).join('');
  return `<c:multiLvlStrRef><c:f>Sheet1!$A$2:$B$${count + 1}</c:f><c:multiLvlStrCache><c:ptCount val="${count}"/>${written}</c:multiLvlStrCache></c:multiLvlStrRef>`;
}

/** Options for {@link ser}. */
export interface SeriesOptions {
  readonly idx: number;
  readonly order?: number;
  /** The series name, cached from a cell; omitted, the series has none. */
  readonly name?: string;
  /** The `c:cat` content, such as {@link strRef}'s. */
  readonly cat?: string;
  readonly val?: string;
  readonly xVal?: string;
  readonly yVal?: string;
  readonly bubbleSize?: string;
  /** Raw XML placed after `c:tx`: `c:spPr`, `c:marker`. */
  readonly extra?: string;
  /** Raw XML placed last: `c:smooth`. */
  readonly tail?: string;
}

/** A series, its elements in schema order. */
export function ser(options: SeriesOptions): string {
  const parts = [
    `<c:idx val="${options.idx}"/>`,
    `<c:order val="${options.order ?? options.idx}"/>`,
    options.name === undefined ? '' : `<c:tx>${strRef([options.name])}</c:tx>`,
    options.extra ?? '',
    options.cat === undefined ? '' : `<c:cat>${options.cat}</c:cat>`,
    options.val === undefined ? '' : `<c:val>${options.val}</c:val>`,
    options.xVal === undefined ? '' : `<c:xVal>${options.xVal}</c:xVal>`,
    options.yVal === undefined ? '' : `<c:yVal>${options.yVal}</c:yVal>`,
    options.bubbleSize === undefined ? '' : `<c:bubbleSize>${options.bubbleSize}</c:bubbleSize>`,
    options.tail ?? '',
  ];
  return `<c:ser>${parts.join('')}</c:ser>`;
}

/** A title of rich text. */
export function title(text: string): string {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escape(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

/** Options for an axis. */
export interface AxisOptions {
  readonly id: number;
  readonly cross: number;
  readonly position?: string;
  readonly title?: string;
  readonly deleted?: boolean;
  /** Raw XML after the position: `c:numFmt`. */
  readonly extra?: string;
}

function axis(kind: string, options: AxisOptions, fallback: string): string {
  return `<c:${kind}><c:axId val="${options.id}"/><c:scaling><c:orientation val="minMax"/></c:scaling>`
    + `<c:delete val="${options.deleted === true ? 1 : 0}"/><c:axPos val="${options.position ?? fallback}"/>`
    + `${options.title === undefined ? '' : title(options.title)}${options.extra ?? ''}`
    + `<c:crossAx val="${options.cross}"/></c:${kind}>`;
}

export const catAx = (options: AxisOptions): string => axis('catAx', options, 'b');
export const dateAx = (options: AxisOptions): string => axis('dateAx', options, 'b');
export const valAx = (options: AxisOptions): string => axis('valAx', options, 'l');
export const serAx = (options: AxisOptions): string => axis('serAx', options, 'b');

/** The `c:axId`s a group names. */
export function axIds(...ids: number[]): string {
  return ids.map(id => `<c:axId val="${id}"/>`).join('');
}

/** Options for {@link chartSpace}. */
export interface ChartOptions {
  /** The chart's own title. */
  readonly title?: string;
  readonly autoTitleDeleted?: boolean;
  /** `gap`, `zero` or `span`. */
  readonly blanks?: string;
  readonly date1904?: boolean;
}

/** A chart part whose plot area holds `plotArea`: its groups, then its axes. */
export function chartSpace(plotArea: string, options: ChartOptions = {}): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}">`
    + `<c:date1904 val="${options.date1904 === true ? 1 : 0}"/><c:chart>`
    + `${options.title === undefined ? '' : title(options.title)}`
    + `<c:autoTitleDeleted val="${options.autoTitleDeleted === true ? 1 : 0}"/>`
    + `<c:plotArea><c:layout/>${plotArea}</c:plotArea>`
    + `${options.blanks === undefined ? '' : `<c:dispBlanksAs val="${options.blanks}"/>`}`
    + `</c:chart></c:chartSpace>`;
}

/** A level of a chartEx dimension; `null` leaves the point out. */
export function cxLevel(values: readonly (string | number | null)[], formatCode?: string): string {
  const points = values
    .map((value, i) => (value === null ? '' : `<cx:pt idx="${i}">${escape(String(value))}</cx:pt>`))
    .join('');
  return `<cx:lvl ptCount="${values.length}"${formatCode === undefined ? '' : ` formatCode="${formatCode}"`}>${points}</cx:lvl>`;
}

/** Options for {@link chartExSpace}. */
export interface ChartExSeries {
  readonly layoutId: string;
  readonly name?: string;
  /** The data block the series reads: `0` by default. */
  readonly dataId?: number;
  /** Raw `cx:layoutPr` content. */
  readonly layout?: string;
  readonly hidden?: boolean;
}

/** One `cx:data` block: its category levels (outer first) and its values. */
export interface ChartExData {
  readonly categories?: readonly (readonly (string | number | null)[])[];
  readonly values: readonly (number | null)[];
  /** The values' dimension type: `val`, or `size` for a treemap or sunburst. */
  readonly valueType?: string;
  /** Write the categories as numbers (`cx:numDim`). */
  readonly numericCategories?: boolean;
}

/** A chartEx part. */
export function chartExSpace(
  data: readonly ChartExData[],
  series: readonly ChartExSeries[],
  options: { readonly title?: string; readonly axes?: string } = {},
): string {
  const blocks = data.map((block, id) => {
    const categories = block.categories === undefined
      ? ''
      : `<cx:${block.numericCategories === true ? 'numDim' : 'strDim'} type="cat"><cx:f>Sheet1!$A$2:$A$9</cx:f>`
        + `${[...block.categories].reverse().map(level => cxLevel(level)).join('')}</cx:${block.numericCategories === true ? 'numDim' : 'strDim'}>`;
    const values = `<cx:numDim type="${block.valueType ?? 'val'}"><cx:f>Sheet1!$B$2:$B$9</cx:f>${cxLevel(block.values, 'General')}</cx:numDim>`;
    return `<cx:data id="${id}">${categories}${values}</cx:data>`;
  }).join('');
  const written = series.map(one => `<cx:series layoutId="${one.layoutId}"${one.hidden === true ? ' hidden="1"' : ''}>`
    + `${one.name === undefined ? '' : `<cx:tx><cx:txData><cx:f>Sheet1!$B$1</cx:f><cx:v>${escape(one.name)}</cx:v></cx:txData></cx:tx>`}`
    + `<cx:dataId val="${one.dataId ?? 0}"/>${one.layout === undefined ? '' : `<cx:layoutPr>${one.layout}</cx:layoutPr>`}</cx:series>`).join('');
  const chartTitle = options.title === undefined
    ? ''
    : `<cx:title pos="t" align="ctr" overlay="0"><cx:tx><cx:txData><cx:v>${escape(options.title)}</cx:v></cx:txData></cx:tx></cx:title>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<cx:chartSpace xmlns:a="${A}" xmlns:r="${R}" xmlns:cx="${CX}">`
    + `<cx:chartData>${blocks}</cx:chartData><cx:chart>${chartTitle}`
    + `<cx:plotArea><cx:plotAreaRegion>${written}</cx:plotAreaRegion>${options.axes ?? ''}</cx:plotArea>`
    + `</cx:chart></cx:chartSpace>`;
}
