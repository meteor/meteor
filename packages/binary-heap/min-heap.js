import { MaxHeap } from './max-heap.js';

export class MinHeap extends MaxHeap {
  constructor(comparator, options) {
    super((a, b) => -comparator(a, b), options);
  }

  maxElementId() {
    throw new Error("Cannot call maxElementId on MinHeap");
  }

  minElementId() {
    return super.maxElementId();
  }
};
