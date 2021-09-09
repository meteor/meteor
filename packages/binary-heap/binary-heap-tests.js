import { MaxHeap } from './max-heap.js';
import { MinMaxHeap } from './min-max-heap.js';

// Based on underscore implementation (Fisher-Yates shuffle)
const shuffle = arr => {
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

Tinytest.add("binary-heap - simple max-heap tests", test => {
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

Tinytest.add("binary-heap - big test for max-heap", test => {
  const positiveNumbers = shuffle(range(1, 41));
  const negativeNumbers = shuffle(range(-1, -41, -1));
  const allNumbers = [...negativeNumbers, ...positiveNumbers];

  const heap = new MaxHeap((a, b) => a - b);
  const output = [];

  allNumbers.forEach(n => heap.set(n, n));

  allNumbers.forEach(() => {
    const maxId = heap.maxElementId();
    output.push(heap.get(maxId));
    heap.remove(maxId);
  });

  allNumbers.sort((a, b) => b - a);

  test.equal(output, allNumbers);
});

Tinytest.add("binary-heap - min-max heap tests", test => {
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

Tinytest.add("binary-heap - big test for min-max-heap", test => {
  const N = 500;
  const positiveNumbers = shuffle(range(1, N + 1));
  const negativeNumbers = shuffle(range(-1, -N - 1, -1));
  const allNumbers = [...positiveNumbers, ...negativeNumbers];

  const heap = new MinMaxHeap((a, b) => a - b);
  let output = [];

  const initialSets = [...allNumbers];
  allNumbers.forEach(n => {
    heap.set(n, n);
    heap._selfCheck();
    heap._minHeap._selfCheck();
  });

  shuffle(allNumbers);
  const secondarySets = [...allNumbers];

  allNumbers.forEach(n => {
    heap.set(-n, n);
    heap._selfCheck();
    heap._minHeap._selfCheck();
  });

  allNumbers.forEach(() => {
    const minId = heap.minElementId();
    output.push(heap.get(minId));
    heap.remove(minId);
    heap._selfCheck(); heap._minHeap._selfCheck();
  });

  test.equal(heap.size(), 0);

  allNumbers.sort((a, b) => a - b);

  const initialTestText = `initial sets: ${initialSets.toString()}` +
    `; secondary sets: ${secondarySets.toString()}`;
  test.equal(output, allNumbers, initialTestText);

  initialSets.forEach(n => heap.set(n, n));
  secondarySets.forEach(n => heap.set(-n, n));

  allNumbers.sort((a, b) => b - a);
  output = [];
  allNumbers.forEach(() => {
    const maxId = heap.maxElementId();
    output.push(heap.get(maxId));
    heap.remove(maxId);
    heap._selfCheck(); heap._minHeap._selfCheck();
  });

  test.equal(output, allNumbers, initialTestText);
});
