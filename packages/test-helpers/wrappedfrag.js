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
  return Meteor.ui._Sarge.holdFrag(this.frag), this;
};

WrappedFrag.prototype.release = function() {
  return Meteor.ui._Sarge.releaseFrag(this.frag), this;
};

WrappedFrag.prototype.node = function() {
  return this.frag;
};
