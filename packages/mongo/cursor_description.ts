interface CursorOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  fields?: Record<string, 1 | 0>;
  projection?: Record<string, 1 | 0>;
  disableOplog?: boolean;
  _disableOplog?: boolean;
  tailable?: boolean;
}

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