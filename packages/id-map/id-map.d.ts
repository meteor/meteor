/**
 * A Map-like data structure indexed by Mongo ObjectIDs or other serializable keys.
 */
export class IdMap<K, V> {
  constructor(idStringify?: (id: K) => string, idParse?: (str: string) => K);

  /** Get the value associated with an ID. */
  get(id: K): V | undefined;

  /** Set the value associated with an ID. */
  set(id: K, value: V): void;

  /** Remove the entry for an ID. */
  remove(id: K): void;

  /** Check whether an ID exists in the map. */
  has(id: K): boolean;

  /** Check whether the map is empty. */
  empty(): boolean;

  /** Remove all entries. */
  clear(): void;

  /**
   * Iterate over entries. Return `false` from the iterator to break the loop.
   * @param iterator Called with (value, id) for each entry
   */
  forEach(iterator: (value: V, id: K) => boolean | void): void;

  /**
   * Async version of forEach.
   * @param iterator Called with (value, id) for each entry
   */
  forEachAsync(
    iterator: (value: V, id: K) => Promise<boolean | void> | boolean | void,
  ): Promise<void>;

  /** Return the number of entries. */
  size(): number;

  /**
   * Get the value for an ID, or set it to `def` if it doesn't exist.
   * @param id The ID to look up
   * @param def The default value to set and return if the ID is not found
   * @returns The existing or newly set value
   */
  setDefault(id: K, def: V): V;

  /** Create a deep clone of this IdMap using EJSON.clone. */
  clone(): IdMap<K, V>;
}
