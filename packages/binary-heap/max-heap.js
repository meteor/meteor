// Constructor of Heap
// - comparator - Function - given two items returns a number
// - options:
//   - initData - Array - Optional - the initial data in a format:
//        Object:
//          - id - String - unique id of the item
//          - value - Any - the data value
//      each value is retained
//   - IdMap - Constructor - Optional - custom IdMap class to store id->index
//       mappings internally. Standard IdMap is used by default.
export class MaxHeap { 
  constructor(comparator, options = {}) {
    if (typeof comparator !== 'function') {
      throw new Error('Passed comparator is invalid, should be a comparison function');
    }

    // a C-style comparator that is given two values and returns a number,
    // negative if the first value is less than the second, positive if the second
    // value is greater than the first and zero if they are equal.
    this._comparator = comparator;

    if (! options.IdMap) {
      options.IdMap = IdMap;
    }

    // _heapIdx maps an id to an index in the Heap array the corresponding value
    // is located on.
    this._heapIdx = new options.IdMap;

    // The Heap data-structure implemented as a 0-based contiguous array where
    // every item on index idx is a node in a complete binary tree. Every node can
    // have children on indexes idx*2+1 and idx*2+2, except for the leaves. Every
    // node has a parent on index (idx-1)/2;
    this._heap = [];

    // If the initial array is passed, we can build the heap in linear time
    // complexity (O(N)) compared to linearithmic time complexity (O(nlogn)) if
    // we push elements one by one.
    if (Array.isArray(options.initData)) {
      this._initFromData(options.initData);
    }
  }

  // Builds a new heap in-place in linear time based on passed data
  _initFromData(data) {
    this._heap = data.map(({ id, value }) => ({ id, value }));

    data.forEach(({ id }, i) => this._heapIdx.set(id, i));

    if (! data.length) {
      return;
    }

    // start from the first non-leaf - the parent of the last leaf
    for (let i = parentIdx(data.length - 1); i >= 0; i--) {
      this._downHeap(i);
    }
  }

  _downHeap(idx) {
    while (leftChildIdx(idx) < this.size()) {
      const left = leftChildIdx(idx);
      const right = rightChildIdx(idx);
      let largest = idx;

      if (left < this.size()) {
        largest = this._maxIndex(largest, left);
      }

      if (right < this.size()) {
        largest = this._maxIndex(largest, right);
      }

      if (largest === idx) {
        break;
      }

      this._swap(largest, idx);
      idx = largest;
    }
  }

  _upHeap(idx) {
    while (idx > 0) {
      const parent = parentIdx(idx);
      if (this._maxIndex(parent, idx) === idx) {
        this._swap(parent, idx)
        idx = parent;
      } else {
        break;
      }
    }
  }

  _maxIndex(idxA, idxB) {
    const valueA = this._get(idxA);
    const valueB = this._get(idxB);
    return this._comparator(valueA, valueB) >= 0 ? idxA : idxB;
  }

  // Internal: gets raw data object placed on idxth place in heap
  _get(idx) {
    return this._heap[idx].value;
  }

  _swap(idxA, idxB) {
    const recA = this._heap[idxA];
    const recB = this._heap[idxB];

    this._heapIdx.set(recA.id, idxB);
    this._heapIdx.set(recB.id, idxA);

    this._heap[idxA] = recB;
    this._heap[idxB] = recA;
  }

  get(id) {
    return this.has(id) ?
      this._get(this._heapIdx.get(id)) :
      null;
  }

  set(id, value) {
    if (this.has(id)) {
      if (this.get(id) === value) {
        return;
      }

      const idx = this._heapIdx.get(id);
      this._heap[idx].value = value;

      // Fix the new value's position
      // Either bubble new value up if it is greater than its parent
      this._upHeap(idx);
      // or bubble it down if it is smaller than one of its children
      this._downHeap(idx);
    } else {
      this._heapIdx.set(id, this._heap.length);
      this._heap.push({ id, value });
      this._upHeap(this._heap.length - 1);
    }
  }

  remove(id) {
    if (this.has(id)) {
      const last = this._heap.length - 1;
      const idx = this._heapIdx.get(id);

      if (idx !== last) {
        this._swap(idx, last);
        this._heap.pop();
        this._heapIdx.remove(id);

        // Fix the swapped value's position
        this._upHeap(idx);
        this._downHeap(idx);
      } else {
        this._heap.pop();
        this._heapIdx.remove(id);
      }
    }
  }

  has(id) {
    return this._heapIdx.has(id);
  }

  empty() {
    return !this.size();
  }

  clear() {
    this._heap = [];
    this._heapIdx.clear();
  }

  // iterate over values in no particular order
  forEach(iterator) {
    this._heap.forEach(obj => iterator(obj.value, obj.id));
  }

  size() {
    return this._heap.length;
  }

  setDefault(id, def) {
    if (this.has(id)) {
      return this.get(id);
    }

    this.set(id, def);
    return def;
  }

  clone() {
    const clone = new MaxHeap(this._comparator, this._heap);
    return clone;
  }

  maxElementId() {
    return this.size() ? this._heap[0].id : null;
  }

  _selfCheck() {
    for (let i = 1; i < this._heap.length; i++) {
      if (this._maxIndex(parentIdx(i), i) !== parentIdx(i)) {
          throw new Error(`An item with id ${this._heap[i].id}` +
                          " has a parent younger than it: " +
                          this._heap[parentIdx(i)].id);
      }
    }
  }
}

const leftChildIdx = i => i * 2 + 1;
const rightChildIdx = i => i * 2 + 2;
const parentIdx = i => (i - 1) >> 1;
