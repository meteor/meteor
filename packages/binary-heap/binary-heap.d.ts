/** Options accepted by the heap constructors. */
interface HeapOptions {
  /** Custom IdMap constructor used to store the id → index mapping. */
  IdMap?: unknown;
  /** Initial `{ id, value }` pairs to build the heap from. */
  initData?: Array<{ id: string; value: unknown }>;
}

/**
 * A binary max-heap keyed by id. `V` is the type of the values being compared
 * by the supplied comparator (defaults to `number`).
 */
export class MaxHeap<V = number> {
  constructor(comparator: (a: V, b: V) => number, options?: HeapOptions);

  /** Value stored for `id`, or `null` if absent. */
  get(id: string): V | null;
  /** Insert or update the value for `id`. */
  set(id: string, value: V): void;
  /** Remove `id` from the heap. */
  remove(id: string): void;
  /** Whether `id` is present. */
  has(id: string): boolean;
  /** Whether the heap has no elements. */
  empty(): boolean;
  /** Remove every element. */
  clear(): void;
  /** Iterate over every `value`/`id` pair. */
  forEach(iterator: (value: V, id: string) => void): void;
  /** Number of elements. */
  size(): number;
  /** Set `id` to `def` only if it isn't already present; returns the value. */
  setDefault(id: string, def: V): V;
  /** A structural copy of the heap. */
  clone(): MaxHeap<V>;
  /** Id of the maximum element, or `null` if empty. */
  maxElementId(): string | null;
}

/** A binary min-heap: a `MaxHeap` with an inverted comparator. */
export class MinHeap<V = number> extends MaxHeap<V> {
  /** Id of the minimum element, or `null` if empty. */
  minElementId(): string | null;
  /** Not supported on a MinHeap — always throws. */
  maxElementId(): never;
}

/** A heap exposing both extremes. */
export class MinMaxHeap<V = number> extends MaxHeap<V> {
  /** Id of the minimum element, or `null` if empty. */
  minElementId(): string | null;
}
