// Like LiveRange, but a lot simpler, with unidirectional pointers.
//
// A Chunk represents a range of one or more consecutive sibling
// nodes in the DOM by keeping pointers to the first and last node.
// Trees of nested Chunks can be formed where the subchunks represent
// non-overlapping ranges within the superchunk.  To facilitate this
// use, the endpoints of a Chunk may be defined by reference to
// subchunks.
//
// `new Chunk(start, [end])`
//
// `start` and `end` are each either a Chunk or a DOM Node.
// If omitted, `end` defaults to `start`.
//
// The *first node* of a chunk is defined recursively as the
// first node of `start`, if `start` is a Chunk, or else `start`
// itself.  Likewise for the *last node* and `end`.
//
// The first node and last node of a Chunk must be siblings (or the
// same node), meaning they share the same non-null parent node.  The
// siblings must be in order, that is, the last node must be the same
// as, or after, the first node.
//
// Conceptually, a Chunk points to the range of the DOM containing
// the first node, the last node, the siblings in between them,
// and all the descendents of those nodes.
//
// Chunks are mutable, and firstNode() and lastNode() are calculated
// when accessed based on the state of the Chunk and the Chunks it
// refers to.  The main reason to mutate a Chunk is after changing
// the DOM within it, upon which the Chunk may start or end with a
// different Chunk or Node than before and need to be adjusted
// accordingly.
//
// Chunk pointers are unidirectional; there are no pointers back
// from the DOM.  Chunks do not exist "in" the DOM, and if they
// form a hierarchy, it is not possible to walk up or across
// the hierarchy, only down, and only then if the outer chunk
// has an endpoint defined in terms of the inner Chunk.
// Chunk objects wrapped around each other are distinct only in
// their potential to mutate.  For example, given a Chunk `c`,
// if you create a new Chunk(c, c) and never mutate it, you
// could equivalently use `c` instead.

Chunk = function (start, end) {
  this.set(start, end);
};

_.extend(Chunk.prototype, {
  firstNode: function () {
    return this.start instanceof Chunk ?
      this.start.firstNode() : this.start;
  },
  lastNode: function () {
    return this.end instanceof Chunk ?
      this.end.lastNode() : this.end;
  },
  set: function (start, end) {
    end = end || start;
    if (! (start instanceof Chunk || (start && start.nodeType)))
      throw new Error("start must be a Chunk or a Node");
    if (! (end instanceof Chunk || (end && end.nodeType)))
      throw new Error("end must be a Chunk or a Node");

    this.start = start;
    this.end = end;

    // this check involves a little calculation but it catches
    // too many errors to leave out.
    var firstNodeParent = this.firstNode().parentNode;
    var lastNodeParent = this.lastNode().parentNode;
    if (! firstNodeParent || ! lastNodeParent)
      throw new Error("start and end must have parents");
    if (firstNodeParent !== lastNodeParent)
      throw new Error("start and end must have same parent");
  },
  parentNode: function () {
    return this.firstNode().parentNode;
  }
});

_.extend(Chunk.prototype, {
  findOne: function (selector) {
    return DomUtils.findClipped(
      this.parentNode(), selector, this.firstNode(), this.lastNode());
  },
  findAll: function (selector) {
    return DomUtils.findAllClipped(
      this.parentNode(), selector, this.firstNode(), this.lastNode());
  }
});
