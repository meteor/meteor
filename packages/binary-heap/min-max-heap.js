import { MaxHeap } from './max-heap';
import { MinHeap } from './min-heap';

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

  set(id, value) {
    MaxHeap.prototype.set.apply(this, arguments);
    this._minHeap.set(id, value);
  }

  remove(id) {
    MaxHeap.prototype.remove.apply(this, arguments);
    this._minHeap.remove(id);
  }

  clear() {
    MaxHeap.prototype.clear.apply(this, arguments);
    this._minHeap.clear();
  }

  setDefault(id, def) {
    MaxHeap.prototype.setDefault.apply(this, arguments);
    return this._minHeap.setDefault(id, def);
  }

  clone() {
    const clone = new MinMaxHeap(this._comparator, this._heap);
    return clone;
  }

  minElementId() {
    return this._minHeap.minElementId();
  }

};
