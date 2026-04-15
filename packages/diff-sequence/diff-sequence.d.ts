export namespace DiffSequence {
  export interface DiffObserver<T> {
    added?: (id: string, fields: Partial<T>) => void;
    addedBefore?: (id: string, fields: Partial<T>, before: string | null) => void;
    changed?: (id: string, fields: Partial<T>) => void;
    movedBefore?: (id: string, before: string | null) => void;
    removed?: (id: string) => void;
  }

  export interface DiffOptions<T> {
    projectionFn?: (doc: T) => Partial<T>;
  }

  export interface ObjectDiffCallbacks<V> {
    leftOnly?: (key: string, leftValue: V) => void;
    rightOnly?: (key: string, rightValue: V) => void;
    both?: (key: string, leftValue: V, rightValue: V) => void;
  }

  export interface MapDiffCallbacks<K, V> {
    leftOnly?: (key: K, leftValue: V) => void;
    rightOnly?: (key: K, rightValue: V) => void;
    both?: (key: K, leftValue: V, rightValue: V) => void;
  }

  /**
   * Diff two sets of query results, calling observer callbacks for changes.
   * @param ordered Whether the results are ordered (arrays) or unordered (IdMaps)
   * @param oldResults The old result set
   * @param newResults The new result set
   * @param observer Callbacks for added, changed, removed, movedBefore
   * @param options Optional configuration
   */
  export function diffQueryChanges<T>(
    ordered: boolean,
    oldResults: T[] | Map<string, T>,
    newResults: T[] | Map<string, T>,
    observer: DiffObserver<T>,
    options?: DiffOptions<T>
  ): void;

  /**
   * Diff two unordered sets of query results.
   */
  export function diffQueryUnorderedChanges<T>(
    oldResults: Map<string, T>,
    newResults: Map<string, T>,
    observer: DiffObserver<T>,
    options?: DiffOptions<T>
  ): void;

  /**
   * Diff two ordered arrays of query results.
   */
  export function diffQueryOrderedChanges<T>(
    oldResults: T[],
    newResults: T[],
    observer: DiffObserver<T>,
    options?: DiffOptions<T>
  ): void;

  /**
   * General helper for diff-ing two objects.
   */
  export function diffObjects<V>(
    left: Record<string, V>,
    right: Record<string, V>,
    callbacks: ObjectDiffCallbacks<V>
  ): void;

  /**
   * General helper for diff-ing two Maps.
   */
  export function diffMaps<K, V>(
    left: Map<K, V>,
    right: Map<K, V>,
    callbacks: MapDiffCallbacks<K, V>
  ): void;

  /**
   * Compute the changed fields between two documents.
   * @returns A fields object where keys with `undefined` values indicate removed fields
   */
  export function makeChangedFields<T extends Record<string, unknown>>(
    newDoc: T,
    oldDoc: T
  ): Partial<T>;

  /**
   * Apply change fields to a document.
   * Fields with `undefined` values are deleted from the document.
   */
  export function applyChanges<T extends Record<string, unknown>>(
    doc: T,
    changeFields: Partial<T>
  ): void;
}
