// OnscreenDiv is an object that appends a DIV to the document
// body and keeps track of it, providing methods that query it,
// mutate, and destroy it.
//
// By default the DIV has style 'display: none'.
//
// In general, methods of OnscreenDiv operate on the contents
// of the DIV excluding the DIV itself.

// Constructor, with optional 'new':
// var d = [new] OnscreenDiv([frag])
var OnscreenDiv = function(optFrag) {
  if (! (this instanceof OnscreenDiv))
    return new OnscreenDiv(optFrag);

  this.div = Meteor.ui._htmlToFragment(
    '<div class="OnscreenDiv" style="display: none"></div>').firstChild;
  document.body.appendChild(this.div);

  if (optFrag)
    this.div.appendChild(optFrag);
};

// get the innerHTML of the DIV
OnscreenDiv.prototype.rawHtml = function() {
  return this.div.innerHTML;
};

// get the innerHTML with some sanitization that tries
// to produce predictable results across browsers.
OnscreenDiv.prototype.html = function() {
  return canonicalizeHtml(this.rawHtml());
};

// get the text of the DIV
OnscreenDiv.prototype.text = function() {
  return this.div.innerText || this.div.textContent;
};

// get the DIV itself
OnscreenDiv.prototype.node = function() {
  return this.div;
};

// remove the DIV from the document and trigger
// "fast GC" -- i.e., after the next Meteor.flush()
// the DIV will be fully cleaned up by LiveUI.
OnscreenDiv.prototype.kill = function() {
  // remove DIV from document by putting it in a fragment
  var frag = document.createDocumentFragment();
  frag.appendChild(this.div);
  // instigate clean-up on next flush()
  Meteor.ui._Sarge.atFlushTime(function() {
    Meteor.ui._Sarge.shuck(frag);
  });
};

// remove the DIV from the document
OnscreenDiv.prototype.remove = function() {
  this.div.parentNode.removeChild(this.div);
};

// Show the div (which is otherwise display:none),
// for tests that require it or for debugging of tests.
// If invisibly=true, make the div 0-height to obscure
// the contents.
OnscreenDiv.prototype.show = function(invisibly) {
  this.div.style.display = "block";
  if (invisibly) {
    this.div.style.height = 0;
    this.div.style.overflow = 'hidden';
  }
};
