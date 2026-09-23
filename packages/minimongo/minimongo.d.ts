export interface Document {
  _id?: string | undefined;
  [key: string]: any;
}

export type Selector<T> =
  | T
  | Partial<T>
  | {
      [key in keyof T]?:
        | T[key]
        | ComparisonOperator<T[key]>
        | ValueOperator<T[key]>;
    }
  | { $and?: Selector<T>[] }
  | { $or?: Selector<T>[] }
  | { $nor?: Selector<T>[] };

type ComparisonOperator<T> = {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
};

type ValueOperator<T> = {
  $exists?: boolean;
  $type?: string | number;
};

export type Modifier<T> = {
  $set?: Partial<T>;
  $unset?: { [key in keyof T]?: true };
  $inc?: { [key in keyof T]?: number };
  $push?: { [key in keyof T]?: any };
  $pull?: { [key in keyof T]?: any };
} & Partial<T>;

export interface FindOptions<T> {
  sort?: Array<[keyof T, 1 | -1]> | { [key in keyof T]?: 1 | -1 };
  skip?: number;
  limit?: number;
  reactive?: boolean;
  transform?: (doc: T) => any;
  projection?: { [key in keyof T]?: 1 | 0 };
}

export interface ObserveCallbacks<T> {
  added?(doc: T): void;
  addedAt?(doc: T, atIndex: number, before: T | null): void;
  changed?(newDoc: T, oldDoc: T): void;
  changedAt?(newDoc: T, oldDoc: T, indexAt: number): void;
  removed?(doc: T): void;
  removedAt?(doc: T, atIndex: number): void;
  movedTo?(doc: T, fromIndex: number, toIndex: number, before: T | null): void;
}

export interface ObserveChangesCallbacks<T> {
  added?(id: string, fields: Partial<T>): void;
  addedBefore?(id: string, fields: Partial<T>, before: T | null): void;
  changed?(id: string, fields: Partial<T>): void;
  movedBefore?(id: string, before: T | null): void;
  removed?(id: string): void;
}

export interface ObserveHandle {
  stop(): void;
}

export class Cursor<T> {
  count(applySkipLimit?: boolean): number;
  fetch(): T[];
  forEach(callback: (doc: T, index: number, cursor: Cursor<T>) => void): void;
  map<M>(callback: (doc: T, index: number, cursor: Cursor<T>) => M): M[];
  observe(callbacks: ObserveCallbacks<T>): ObserveHandle;
  observeChanges(callbacks: ObserveChangesCallbacks<T>): ObserveHandle;
  findOneAsync?(
    selector?: Selector<T>,
    options?: FindOptions<T>,
  ): Promise<T | undefined>;
  fetchAsync?(): Promise<T[]>;
  countAsync?(applySkipLimit?: boolean): Promise<number>;
}

export default class LocalCollection<T extends Document = any> {
  constructor(name?: string);

  find(selector?: Selector<T>, options?: FindOptions<T>): Cursor<T>;
  findOne(selector?: Selector<T>, options?: FindOptions<T>): T | undefined;

  insert(doc: T & { _id?: string }): string;
  update(
    selector: Selector<T>,
    modifier: Modifier<T>,
    options?: { multi?: boolean },
  ): number;
  remove(selector: Selector<T>): number;
  upsert(
    selector: Selector<T>,
    modifier: Modifier<T>,
    options?: { multi?: boolean },
  ): { numberAffected: number; insertedId?: string };

  saveOriginals(): void;
  retrieveOriginals(): Map<string, T>;
  pauseObservers(): void;
  resumeObservers(): void;

  findOneAsync?(
    selector?: Selector<T>,
    options?: FindOptions<T>,
  ): Promise<T | undefined>;
  insertAsync?(doc: T & { _id?: string }): Promise<string>;
  updateAsync?(
    selector: Selector<T>,
    modifier: Modifier<T>,
    options?: { multi?: boolean },
  ): Promise<number>;
  removeAsync?(selector: Selector<T>): Promise<number>;
  upsertAsync?(
    selector: Selector<T>,
    modifier: Modifier<T>,
    options?: { multi?: boolean },
  ): Promise<{ numberAffected: number; insertedId?: string }>;
  countDocuments?(
    selector?: Selector<T>,
    options?: FindOptions<T>,
  ): Promise<number>;
  estimatedDocumentCount?(options?: FindOptions<T>): Promise<number>;
}

export namespace Minimongo {
  export { LocalCollection as LocalCollection };
  export const Matcher: any;
  export const Sorter: any;
}
