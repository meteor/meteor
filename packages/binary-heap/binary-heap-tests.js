import { MaxHeap } from "./max-heap.js";
import { MinHeap } from "./min-heap.js";
import { MinMaxHeap } from "./min-max-heap.js";

// Based on underscore implementation (Fisher-Yates shuffle)
const shuffle = (arr) => {
  let j = 0;
  let temp = null;

  for (let i = arr.length - 1; i > 0; i -= 1) {
    j = Math.floor(Math.random() * (i + 1));
    temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }

  return arr;
};

// Based on underscore implementation
const range = (start, stop, step = 1) => {
  if (stop == null) {
    stop = start || 0;
    start = 0;
  }

  const length = Math.max(Math.ceil((stop - start) / step), 0);
  const range = Array(length);

  for (let idx = 0; idx < length; idx++, start += step) {
    range[idx] = start;
  }

  return range;
};

Tinytest.add("binary-heap - simple max-heap tests", (test) => {
  const h = new MaxHeap((a, b) => a - b);
  h.set("a", 1);
  h.set("b", 233);
  h.set("c", -122);
  h.set("d", 0);
  h.set("e", 0);

  test.equal(h.size(), 5);
  test.equal(h.maxElementId(), "b");
  test.equal(h.get("b"), 233);

  h.remove("b");
  test.equal(h.size(), 4);
  test.equal(h.maxElementId(), "a");
  h.set("e", 44);
  test.equal(h.maxElementId(), "e");
  test.equal(h.get("b"), null);
  test.isTrue(h.has("a"));
  test.isFalse(h.has("dd"));

  h.clear();
  test.isFalse(h.has("a"));
  test.equal(h.size(), 0);
  test.equal(h.setDefault("a", 12345), 12345);
  test.equal(h.setDefault("a", 55555), 12345);
  test.equal(h.size(), 1);
  test.equal(h.maxElementId(), "a");
});

Tinytest.add("binary-heap - big test for max-heap", (test) => {
  const positiveNumbers = shuffle(range(1, 41));
  const negativeNumbers = shuffle(range(-1, -41, -1));
  const allNumbers = [...negativeNumbers, ...positiveNumbers];

  const heap = new MaxHeap((a, b) => a - b);
  const output = [];

  allNumbers.forEach((n) => heap.set(n, n));

  allNumbers.forEach(() => {
    const maxId = heap.maxElementId();
    output.push(heap.get(maxId));
    heap.remove(maxId);
  });

  allNumbers.sort((a, b) => b - a);

  test.equal(output, allNumbers);
});

Tinytest.add("binary-heap - min-max heap tests", (test) => {
  const h = new MinMaxHeap((a, b) => a - b);
  h.set("a", 1);
  h.set("b", 233);
  h.set("c", -122);
  h.set("d", 0);
  h.set("e", 0);

  test.equal(h.size(), 5);
  test.equal(h.maxElementId(), "b");
  test.equal(h.get("b"), 233);
  test.equal(h.minElementId(), "c");

  h.remove("b");
  test.equal(h.size(), 4);
  test.equal(h.minElementId(), "c");
  h.set("e", -123);
  test.equal(h.minElementId(), "e");
  test.equal(h.get("b"), null);
  test.isTrue(h.has("a"));
  test.isFalse(h.has("dd"));

  h.clear();
  test.isFalse(h.has("a"));
  test.equal(h.size(), 0);
  test.equal(h.setDefault("a", 12345), 12345);
  test.equal(h.setDefault("a", 55555), 12345);
  test.equal(h.size(), 1);
  test.equal(h.maxElementId(), "a");
  test.equal(h.minElementId(), "a");
});

Tinytest.add("binary-heap - big test for min-max-heap", (test) => {
  const N = 500;
  const positiveNumbers = shuffle(range(1, N + 1));
  const negativeNumbers = shuffle(range(-1, -N - 1, -1));
  const allNumbers = [...positiveNumbers, ...negativeNumbers];

  const heap = new MinMaxHeap((a, b) => a - b);
  let output = [];

  const initialSets = [...allNumbers];
  allNumbers.forEach((n) => {
    heap.set(n, n);
    heap._selfCheck();
    heap._minHeap._selfCheck();
  });

  shuffle(allNumbers);
  const secondarySets = [...allNumbers];

  allNumbers.forEach((n) => {
    heap.set(-n, n);
    heap._selfCheck();
    heap._minHeap._selfCheck();
  });

  allNumbers.forEach(() => {
    const minId = heap.minElementId();
    output.push(heap.get(minId));
    heap.remove(minId);
    heap._selfCheck();
    heap._minHeap._selfCheck();
  });

  test.equal(heap.size(), 0);

  allNumbers.sort((a, b) => a - b);

  const initialTestText =
    `initial sets: ${initialSets.toString()}` + `; secondary sets: ${secondarySets.toString()}`;
  test.equal(output, allNumbers, initialTestText);

  initialSets.forEach((n) => heap.set(n, n));
  secondarySets.forEach((n) => heap.set(-n, n));

  allNumbers.sort((a, b) => b - a);
  output = [];
  allNumbers.forEach(() => {
    const maxId = heap.maxElementId();
    output.push(heap.get(maxId));
    heap.remove(maxId);
    heap._selfCheck();
    heap._minHeap._selfCheck();
  });

  test.equal(output, allNumbers, initialTestText);
});

Tinytest.add("binary-heap - constructor throws on non-function comparator", (test) => {
  test.throws(() => new MaxHeap(null), /comparator is invalid/);
  test.throws(() => new MaxHeap("not a fn"), /comparator is invalid/);
  test.throws(() => new MaxHeap(), /comparator is invalid/);
});

Tinytest.add("binary-heap - MaxHeap built from initData preserves elements", (test) => {
  const heap = new MaxHeap((a, b) => a - b, {
    initData: [
      { id: "a", value: 5 },
      { id: "b", value: 10 },
      { id: "c", value: 1 },
      { id: "d", value: 7 },
      { id: "e", value: 3 },
    ],
  });

  test.equal(heap.size(), 5);
  test.equal(heap.maxElementId(), "b");
  test.equal(heap.get("a"), 5);
  test.equal(heap.get("d"), 7);

  // Drain should yield descending order.
  const drained = [];
  while (!heap.empty()) {
    const id = heap.maxElementId();
    drained.push(heap.get(id));
    heap.remove(id);
  }
  test.equal(drained, [10, 7, 5, 3, 1]);
});

Tinytest.add("binary-heap - MaxHeap.empty and forEach", (test) => {
  const heap = new MaxHeap((a, b) => a - b);
  test.isTrue(heap.empty());

  heap.set("a", 1);
  heap.set("b", 2);
  heap.set("c", 3);
  test.isFalse(heap.empty());

  const collected = Object.create(null);
  heap.forEach((value, id) => {
    collected[id] = value;
  });
  test.equal(collected, { a: 1, b: 2, c: 3 });
});

Tinytest.add("binary-heap - MaxHeap.set updates existing value and rebalances", (test) => {
  const heap = new MaxHeap((a, b) => a - b);
  heap.set("x", 1);
  heap.set("y", 5);
  heap.set("z", 3);
  test.equal(heap.maxElementId(), "y");

  // Bubble up: x goes to top.
  heap.set("x", 100);
  test.equal(heap.maxElementId(), "x");
  test.equal(heap.get("x"), 100);

  // Bubble down: x drops below y and z.
  heap.set("x", -100);
  test.equal(heap.maxElementId(), "y");
  test.equal(heap.get("x"), -100);
  heap._selfCheck();
});

Tinytest.add("binary-heap - MaxHeap.set with same value is a no-op", (test) => {
  const heap = new MaxHeap((a, b) => a - b);
  heap.set("a", 10);
  heap.set("b", 20);
  heap.set("c", 15);
  const before = heap.maxElementId();

  heap.set("b", 20); // same id, same value
  test.equal(heap.maxElementId(), before);
  test.equal(heap.size(), 3);
  test.equal(heap.get("b"), 20);
});

// O que este teste executa:
// Valida que MaxHeap.clone() produz uma cópia independente com os mesmos elementos, tamanho e elemento máximo.
Tinytest.add("binary-heap - MaxHeap.clone produces independent copy", (test) => {
  const heap = new MaxHeap((a, b) => a - b);
  heap.set("a", 1);
  heap.set("b", 5);
  heap.set("c", 3);

  const clone = heap.clone();

  test.equal(clone.size(), 3);
  test.isFalse(clone.empty());
  test.equal(clone.maxElementId(), "b");
  test.equal(clone.get("a"), 1);
  test.equal(clone.get("b"), 5);
  test.equal(clone.get("c"), 3);

  // Mutações no clone não afetam o original
  clone.set("d", 10);
  test.equal(clone.size(), 4);
  test.equal(clone.maxElementId(), "d");
  test.equal(heap.size(), 3);
  test.equal(heap.maxElementId(), "b");

  clone.remove("a");
  test.equal(clone.size(), 3);
  test.equal(clone.get("a"), null);
  test.equal(heap.size(), 3);
  test.equal(heap.get("a"), 1);
});

// O que este teste executa:
// Valida que clonar um MaxHeap vazio funciona corretamente sem erros.
Tinytest.add("binary-heap - MaxHeap.clone empty heap", (test) => {
  const heap = new MaxHeap((a, b) => a - b);
  const clone = heap.clone();
  test.equal(clone.size(), 0);
  test.isTrue(clone.empty());
  test.equal(clone.maxElementId(), null);
});

// O que este teste executa:
// Valida que MaxHeap.clone() preserva um construtor IdMap customizado sensível a identidade de objetos.
Tinytest.add("binary-heap - MaxHeap.clone preserves custom IdMap", (test) => {
  class IdentityMap {
    constructor() {
      this._map = new Map();
    }
    set(id, value) {
      this._map.set(id, value);
    }
    get(id) {
      return this._map.get(id);
    }
    has(id) {
      return this._map.has(id);
    }
    remove(id) {
      this._map.delete(id);
    }
    clear() {
      this._map.clear();
    }
  }

  const heap = new MaxHeap((a, b) => a - b, { IdMap: IdentityMap });
  const id1 = { x: 1 };
  const id2 = { x: 1 };
  heap.set(id1, 100);
  heap.set(id2, 200);

  const clone = heap.clone();
  test.equal(clone.size(), 2);
  test.equal(clone.get(id1), 100);
  test.equal(clone.get(id2), 200);
});

Tinytest.add("binary-heap - MinHeap sorts ascending", (test) => {
  const heap = new MinHeap((a, b) => a - b);
  heap.set("a", 5);
  heap.set("b", 1);
  heap.set("c", 3);
  heap.set("d", 8);
  heap.set("e", -2);

  test.equal(heap.minElementId(), "e");

  const drained = [];
  while (!heap.empty()) {
    const id = heap.minElementId();
    drained.push(heap.get(id));
    heap.remove(id);
  }
  test.equal(drained, [-2, 1, 3, 5, 8]);
});

Tinytest.add("binary-heap - MinHeap.maxElementId throws", (test) => {
  const heap = new MinHeap((a, b) => a - b);
  heap.set("a", 1);
  test.throws(() => heap.maxElementId(), /Cannot call maxElementId on MinHeap/);
});

// O que este teste executa:
// Valida que MinMaxHeap.clone() produz uma cópia independente com os mesmos elementos, tamanho, mínimo e máximo.
Tinytest.add("binary-heap - MinMaxHeap.clone produces independent copy", (test) => {
  const heap = new MinMaxHeap((a, b) => a - b);
  heap.set("a", 1);
  heap.set("b", 10);
  heap.set("c", -5);
  heap.set("d", 7);

  const clone = heap.clone();

  test.equal(clone.size(), 4);
  test.isFalse(clone.empty());
  test.equal(clone.maxElementId(), "b");
  test.equal(clone.minElementId(), "c");
  test.equal(clone.get("a"), 1);
  test.equal(clone.get("b"), 10);
  test.equal(clone.get("c"), -5);
  test.equal(clone.get("d"), 7);

  // Mutações no clone não afetam o original
  clone.set("e", 50);
  test.equal(clone.size(), 5);
  test.equal(clone.maxElementId(), "e");
  test.equal(heap.size(), 4);
  test.equal(heap.maxElementId(), "b");

  clone.remove("c");
  test.equal(clone.size(), 4);
  test.equal(clone.minElementId(), "a");
  test.equal(heap.size(), 4);
  test.equal(heap.minElementId(), "c");
});

// O que este teste executa:
// Valida que clonar um MinMaxHeap vazio funciona sem falhas.
Tinytest.add("binary-heap - MinMaxHeap.clone empty heap", (test) => {
  const heap = new MinMaxHeap((a, b) => a - b);
  const clone = heap.clone();
  test.equal(clone.size(), 0);
  test.isTrue(clone.empty());
  test.equal(clone.maxElementId(), null);
  test.equal(clone.minElementId(), null);
});
