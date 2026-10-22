/**
 * MongoDB collation options for locale-aware string comparison.
 *
 * All options are supported server-side via the MongoDB driver.
 * Client-side (Minimongo) support uses `Intl.Collator` and is limited to:
 * `locale`, `strength` (1–3), `caseLevel`, `numericOrdering`, and `caseFirst`.
 *
 * Options marked **server-only** are silently ignored by Minimongo.
 */
interface CollationOptions {
  locale: string;
  caseLevel?: boolean;
  caseFirst?: 'upper' | 'lower' | 'off';
  /**
   * Comparison level. Minimongo supports 1–3 only.
   * Strengths 4 and 5 are **server-only** (no `Intl.Collator` equivalent).
   */
  strength?: 1 | 2 | 3 | 4 | 5;
  numericOrdering?: boolean;
  /** **Server-only.** Ignored by Minimongo. */
  alternate?: 'non-ignorable' | 'shifted';
  /** **Server-only.** Ignored by Minimongo. */
  maxVariable?: 'punct' | 'space';
  /** **Server-only.** Ignored by Minimongo. */
  backwards?: boolean;
}

interface CursorOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  fields?: Record<string, 1 | 0>;
  projection?: Record<string, 1 | 0>;
  collation?: CollationOptions;
  disableOplog?: boolean;
  _disableOplog?: boolean;
  tailable?: boolean;
  transform?: (doc: any) => any;
}

/**
 * Represents the arguments used to construct a cursor.
 * Used as a key for cursor de-duplication.
 *
 * All properties must be either:
 * - JSON-stringifiable, or
 * - Not affect observeChanges output (e.g., options.transform functions)
 */
export class CursorDescription {
  collectionName: string;
  selector: Record<string, any>;
  options: CursorOptions;

  constructor(collectionName: string, selector: any, options?: CursorOptions) {
    this.collectionName = collectionName;
    // @ts-ignore
    this.selector = Mongo.Collection._rewriteSelector(selector);
    this.options = options || {};
  }
}