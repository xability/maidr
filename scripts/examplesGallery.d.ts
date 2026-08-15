/**
 * Hand-written declarations for `examplesGallery.js`.
 *
 * The module is plain JS so `scripts/build-site.js` (run directly by node) can
 * import it; `tsconfig.json` sets `allowJs: false`, so a TypeScript test needs
 * these to import it too. Keep both files in sync.
 */

/** A page under `examples/` that is deliberately not a gallery entry. */
export interface ExcludedExample {
  /** Path relative to `examples/`, e.g. `recharts/index.html`. */
  page: string;
  /** Why it is not a gallery entry. */
  reason: string;
}

/** One entry in a gallery section. */
export interface GalleryItem {
  /** Path relative to `examples/`; absent on a hand-written entry. */
  page?: string;
  /** A hand-written entry's click handler, in place of `loadHTML(...)`. */
  onclick?: string;
  /** The link text. */
  label: string;
  /** The heading the loaded example is announced under. */
  heading: string;
}

/** One integration's section of the gallery. */
export interface GallerySection {
  id: string;
  heading: string;
  headingId?: string;
  note?: string;
  items: GalleryItem[];
}

/** A section's definition, before any page is assigned to it. */
export interface GalleryGroup {
  id: string;
  heading: string;
  headingId?: string;
  note?: string;
  /** Filename prefixes that put a top-level page in this group. */
  prefixes?: string[];
  /** Exact filename stems that put a top-level page in this group. */
  names?: string[];
  /** A subdirectory of `examples/` whose pages all belong to this group. */
  dir?: string;
  /** Dropped from a filename stem before it is turned into a title. */
  strip?: RegExp;
  /** Prepended to the link text to form the announced heading. */
  headingPrefix?: string;
  /** Entries that are not pages, such as the bundled React example. */
  statics?: { onclick: string; label: string }[];
  /** Whether an unprefixed top-level page lands here. At most one group. */
  fallback?: boolean;
}

export declare const EXCLUDED_EXAMPLES: ExcludedExample[];

export declare const CHART_TITLES: Record<string, string>;

export declare const TITLES: Record<string, string | { label: string; heading: string }>;

export declare const GROUPS: GalleryGroup[];

/** Every page under `examples/`, two levels deep, relative to it and sorted. */
export declare function listExamplePages(examplesDir: string): string[];

/**
 * Sort the given pages into gallery sections.
 *
 * `unclaimed` holds pages no group matched, which is how a new subdirectory
 * shows up rather than being mislabelled.
 */
export declare function buildGallery(pages: string[]): {
  sections: GallerySection[];
  unclaimed: string[];
};

/** The gallery's markup. */
export declare function renderGallery(sections: GallerySection[]): string;
