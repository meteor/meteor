// There is no point at small block sizes. They only bring more overhead.
var MINIMAL_BLOCK_SIZE = 5;

/**
 * Data structure - doubly linked list with O(sqrt(n))
 * insert/delete/random access/search in sorted list
 * @constructor
**/
SqrtSkipList = function () {
  this.length = 0;
  this.blockRefs = [];
  this.blockSize = MINIMAL_BLOCK_SIZE;
};

/**
 * List converted to plain array
 * @returns {array}
**/
SqrtSkipList.prototype.toArray = function () {
  var result = [];

  this.forEach(function (item) { result.push(item) });

  return result;
};

SqrtSkipList.prototype.forEach = function (iter) {
  for (var node = this.blockRefs[0], i = 0;
       i < this.length; node = node.next, i++) {
    var r = iter(node.data, i, this);
    if (r === false)
      break;
  }
};

// TODO: for Array compitablitiy to implement:
// TODO: reverse, shift, unshift, sort, splice
// TODO: concat, join, slice, toString, toLocaleString, indexOf, lastIndexOf

/**
 * Appends an item to the end of the list in O(1)
 * @param {any} item
 * @returns {any} pushed item
**/
SqrtSkipList.prototype.push = function (item) {
  return this.insert(item, this.length);
};

/**
 * Removes the last item
 * @returns {any} removed item
**/
SqrtSkipList.prototype.pop = function () {
  return this.remove(this.length - 1);
};

/**
 * Insert a new item to the position, shifts the rest
 * @param {any} item
 * @param {Number} position
 * @returns {Number} total number of items
**/
SqrtSkipList.prototype.insert = function (item, position) {
  if (position > this.length || position < 0) {
    throw new Error("Can't insert at position " + position
                    + ": can only prepend, append or insert in the middle");
  }

  var node;
  if (position === this.length) {
    // first item vs append
    if (this.length === 0) {
      this.blockRefs = [new SSLNode(item, null, null)];
      this.length++;
    } else {
      node = this.getNode(this.length - 1);
      node.next = new SSLNode(item, node, null);
      this.length++;
      this._updateRefs(position, 'prev', node.next);
    }
    this._rebalance();
    return this.length;
  } else {
    node = this.getNode(position);
  }

  var itemNode = new SSLNode(item, node.prev, node);
  if (node.prev) {
    node.prev.next = itemNode;
  }
  node.prev = itemNode;
  this.length++;

  this._updateRefs(position, 'prev');
  this._rebalance();
  return this.length;
};

/**
 * Remove an item, given the position
 * @param {Number} position
 * @returns {any} removed item
**/
SqrtSkipList.prototype.remove = function (position) {
  if (position >= this.length || position < 0) {
    throw new Error('There is nothing to remove on position ' + position);
  }

  var node = this.getNode(position);

  if (node.next) {
    node.next.prev = node.prev;
  }
  if (node.prev) {
    node.prev.next = node.next;
  }

  this.length--;
  this._updateRefs(position, 'next');
  this._rebalance();

  return node.data;
};

/**
 * Returns item on the given position
 * @param {Number} position
 * @returns {any} item
**/
SqrtSkipList.prototype.get = function (position) {
  var node = this.getNode(position);
  return node && node.data;
};

SqrtSkipList.prototype.lowerBoundPosition = function (value, comp) {
  return this.lowerBound(value, comp).position;
};

SqrtSkipList.prototype.lowerBoundNode = function (value, comp) {
  return this.lowerBound(value, comp).node;
};

/**
 * Finds the node an dposition of the first item for which does not compare
 * less than the passed value. Will work only if the list is already sorted
 * using the same predicate.
 * @param {any} value to compare to
 * @param {Function} comp predicate on which the list is sorted
 * @returns {Object} position and node reference
**/
SqrtSkipList.prototype.lowerBound = function (value, comp) {
  var lastBlockRef = this.blockRefs[0];

  for (var blockIndex = 1; blockIndex < this.blockRefs.length+1; blockIndex++) {
    var nextBlockHead = this.blockRefs[blockIndex];
    if (! nextBlockHead || comp(nextBlockHead.data, value) >= 0) {
      var node = lastBlockRef;
      var position = (blockIndex - 1) * this.blockSize;
      while (node && comp(node.data, value) < 0) {
        node = node.next;
        position++;
      }
      return {position: position, node: node};
    }

    lastBlockRef = nextBlockHead;
  }

  return {position: this.length, node: null}
};

/**
 * Returns the reference of node (internal representation) on the given position
 * @param {Number} position
 * @returns {SSLNode}
**/
SqrtSkipList.prototype.getNode = function (position) {
  var blockHead = this.blockRefs[position / this.blockSize |0];
  var blockPosition = position % this.blockSize;

  for (var node = blockHead; blockPosition !== 0; blockPosition--) {
    node = node.next
  }

  return node;
};

/**
 * Decides whether to change the blockSize and recalculates the block refs in
 * case of change
**/
SqrtSkipList.prototype._rebalance = function () {
  // if the current block size is so bad, we have twice as many blocks or twice
  // as less blocks, incerease or decrease the block size. But don't let it
  // drop below MINIMAL_BLOCK_SIZE
  if (this.blockSize * 2 < this.blockRefs.length ||
      this.blockSize / 2 > this.blockRefs.length &&
      this.blockSize > MINIMAL_BLOCK_SIZE) {
    this.blockSize = Math.floor(Math.sqrt(this.length));
    if (this.blockSize < MINIMAL_BLOCK_SIZE)
      this.blockSize = MINIMAL_BLOCK_SIZE;
    this._recalculateRefs();
  }
};

/**
 * Iterates over block refs starting from position and moves them in direction
 * Contract: is called *every* time one remove/insert happens
 * @param {Number} position - first changed position
 * @param {String} direction - 'prev' or 'next' direction of refs' change
 * @param {String} [justInserted] - for O(1) optimization on append
**/
SqrtSkipList.prototype._updateRefs = function (position, direction, justInserted) {
  var blockIndex = position / this.blockSize |0;
  var blockPosition = position % this.blockSize;

  if (blockPosition > 0)
    blockIndex++;

  for (; blockIndex < this.blockRefs.length; blockIndex++) {
    this.blockRefs[blockIndex] = this.blockRefs[blockIndex][direction];
  }

  // Create a new block ref or remove an empty block ref if needed
  var optimalBlocksNumber = Math.ceil(this.length / this.blockSize);
  if (optimalBlocksNumber < this.blockRefs.length) this.blockRefs.pop();
  if (optimalBlocksNumber > this.blockRefs.length)
    this.blockRefs.push(justInserted || this.getNode(this.length - 1));
};


/**
 * Rewrites all block refs based on block size.
 * Called internally every time blockSize is changed
**/
SqrtSkipList.prototype._recalculateRefs = function () {
  if (!this.length)
    return;

  var node = this.blockRefs[0];
  this.blockRefs = [];

  for (var i = 0; i < this.length; i++) {
    if (i % this.blockSize === 0)
      this.blockRefs.push(node);

    node = node.next;
  }
};

/**
 * Internal implementation: a single node
 * @constructor
 * @param {any} data - attached data
 * @param {SSLNode} prev - reference to the previous node or null
 * @param {SSLNode} next - reference to the next node or null
**/
var SSLNode = function (data, prev, next) {
  this.data = data;
  this.prev = prev;
  this.next = next;
};

