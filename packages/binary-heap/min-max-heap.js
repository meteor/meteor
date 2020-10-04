import { MaxHeap } from './max-heap.js';
import { MinHeap } from './min-heap.js';

// This implementation of Min/Max-Heap is just a subclass of Max-Heap
// with a Min-Heap as an encapsulated property.
//
// Most of the operations are just proxy methods to call the same method on both
// heaps.
//
// This implementation takes 2*N memory but is fairly simple to write and
// understand. And the constant factor of a simple Heap is usually smaller
// compared to other two-way priority queues like Min/Max Heaps
// (http://www.cs.otago.ac.nz/staffpriv/mike/Papers/MinMaxHeaps/MinMaxHeaps.pdf)
// and Interval Heaps
// (http://www.cise.ufl.edu/~sahni/dsaac/enrich/c13/double.htm)
export class MinMaxHeap extends MaxHeap {
  constructor(comparator, options) {
    super(comparator, options);
    this._minHeap = new MinHeap(comparator, options);
  }

  set(...args) {
    super.set(...args);
    this._minHeap.set(...args);
  }

  remove(...args) {
    super.remove(...args);
    this._minHeap.remove(...args);
  }

  clear(...args) {
    super.clear(...args);
    this._minHeap.clear(...args);
  }

  setDefault(...args) {
    super.setDefault(...args);
    return this._minHeap.setDefault(...args);
  }

  clone() {
    const clone = new MinMaxHeap(this._comparator, this._heap);
    return clone;
  }

  minElementId() {
    return this._minHeap.minElementId();
  }

};
