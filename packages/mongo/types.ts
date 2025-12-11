export interface ObserveCallbacks<T> {
  added?(document: T): void;
  addedAt?(document: T, atIndex: number, before: T | null): void;
  changed?(newDocument: T, oldDocument: T): void;
  changedAt?(newDocument: T, oldDocument: T, indexAt: number): void;
  removed?(oldDocument: T): void;
  removedAt?(oldDocument: T, atIndex: number): void;
  movedTo?(
    document: T,
    fromIndex: number,
    toIndex: number,
    before: T | null
  ): void;
}

export interface ObserveChangesCallbacks<T> {
  added?(id: string, fields: Partial<T>): void;
  addedBefore?(id: string, fields: Partial<T>, before: T | null): void;
  changed?(id: string, fields: Partial<T>): void;
  movedBefore?(id: string, before: T | null): void;
  removed?(id: string): void;
}