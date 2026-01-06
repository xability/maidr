/**
 * Represents a saved mark position in a plot.
 */
export interface Mark {
  /** Unique identifier for the trace this mark belongs to */
  traceId: string;
  /** Row position within the trace (0 for 1D plots) */
  row: number;
  /** Column position within the trace */
  col: number;
}

/**
 * Collection of marks for a single figure, indexed by slot (0-9).
 */
export interface FigureMarks {
  /** The figure ID this marks collection belongs to */
  figureId: string;
  /** Map of slot number (0-9) to Mark */
  marks: Record<number, Mark | null>;
}

/**
 * Storage key prefix for persisting marks to localStorage.
 */
export const MARK_STORAGE_PREFIX = 'maidr-marks-';