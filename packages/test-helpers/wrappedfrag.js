// A WrappedFrag provides utility methods pertaining to a given
// DocumentFragment that are helpful in tests.  For example,
// WrappedFrag(frag).html() constructs a sort of cross-browser
// innerHTML for the fragment.

// Constructor, with optional 'new':
// var f = [new] WrappedFrag([frag])
WrappedFrag = function(frag) {
  if (! (this instanceof WrappedFrag))
    return new WrappedFrag(frag);

  this.frag = frag;
};

WrappedFrag.prototype.rawHtml = function() {
  return DomUtils.fragmentToHtml(this.frag);
};

WrappedFrag.prototype.html = function() {
  return canonicalizeHtml(this.rawHtml());
};

WrappedFrag.prototype.hold = function() {
  // increments frag's GC protection reference count
  this.frag["_protect"] = (this.frag["_protect"] || 0) + 1;
  return this;
};

WrappedFrag.prototype.release = function() {
  var frag = this.frag;
  // decrement frag's GC protection reference count
  // Clean up on flush, if hits 0.  Wait to decrement
  // so no one else cleans it up first.
  Meteor._atFlush(function () {
    if (! --frag["_protect"]) {
      Spark.finalize(frag);
    }
  });
  return this;
};

WrappedFrag.prototype.node = function() {
  return this.frag;
};
