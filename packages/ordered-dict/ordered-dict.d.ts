/**
 * An ordered dictionary backed by a doubly-linked list.
 * Items can be positioned relative to other items.
 */
export class OrderedDict<K = string, V = unknown> {
  /** Sentinel value to break out of forEach/forEachAsync iteration. */
  static readonly BREAK: { break: true };

  /**
   * @param stringify Optional key stringification function
   * @param entries Optional initial [key, value] pairs
   */
  constructor(...entries: [K, V][]);
  constructor(stringify: (key: K) => string, ...entries: [K, V][]);

  /** Check if the dictionary is empty. */
  empty(): boolean;

  /** Return the number of entries. */
  size(): number;

  /**
   * Insert an item before the specified key.
   * @param key The key of the item to insert
   * @param item The value to associate with the key
   * @param before The key of the item to insert before, or null for end
   * @throws Error if the key already exists or the 'before' key is not found
   */
  putBefore(key: K, item: V, before: K | null): void;

  /** Append an item at the end. */
  append(key: K, item: V): void;

  /**
   * Remove an item by key.
   * @returns The removed value
   * @throws Error if the key is not found
   */
  remove(key: K): V;

  /** Get the value for a key. */
  get(key: K): V | undefined;

  /** Check if a key exists. */
  has(key: K): boolean;

  /**
   * Iterate in order. Return `OrderedDict.BREAK` to stop early.
   * @param iter Called with (value, key, index)
   * @param context Optional `this` context for the iterator
   */
  forEach(
    iter: (value: V, key: K, index: number) => typeof OrderedDict.BREAK | void,
    context?: unknown,
  ): void;

  /**
   * Async iteration in order.
   * @param asyncIter Called with (value, key, index)
   * @param context Optional `this` context for the iterator
   */
  forEachAsync(
    asyncIter: (
      value: V,
      key: K,
      index: number,
    ) => Promise<typeof OrderedDict.BREAK | void> | typeof OrderedDict.BREAK | void,
    context?: unknown,
  ): Promise<void>;

  /** Get the first key, or undefined if empty. */
  first(): K | undefined;

  /** Get the first value, or undefined if empty. */
  firstValue(): V | undefined;

  /** Get the last key, or undefined if empty. */
  last(): K | undefined;

  /** Get the last value, or undefined if empty. */
  lastValue(): V | undefined;

  /** Get the key before the given key, or null. */
  prev(key: K): K | null;

  /** Get the key after the given key, or null. */
  next(key: K): K | null;

  /**
   * Move an item to be before another item.
   * @throws Error if either key is not found
   */
  moveBefore(key: K, before: K | null): void;

  /** Get the index of a key (linear search). Returns null if not found. */
  indexOf(key: K): number | null;
}
