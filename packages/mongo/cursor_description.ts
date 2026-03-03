interface CollationOptions {
  locale: string;
  caseLevel?: boolean;
  caseFirst?: 'upper' | 'lower' | 'off';
  strength?: 1 | 2 | 3 | 4 | 5;
  numericOrdering?: boolean;
  alternate?: 'non-ignorable' | 'shifted';
  maxVariable?: 'punct' | 'space';
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