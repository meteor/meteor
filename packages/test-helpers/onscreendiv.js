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
OnscreenDiv = function(optFrag) {
  if (! (this instanceof OnscreenDiv))
    return new OnscreenDiv(optFrag);

  this.div = DomUtils.htmlToFragment(
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
// "fast GC" -- i.e., after the next Deps.flush()
// the DIV will be fully cleaned up by LiveUI.
OnscreenDiv.prototype.kill = function() {
  var self = this;
  if (self.div.parentNode)
    self.div.parentNode.removeChild(self.div);

  Deps.afterFlush(function () {
    Spark.finalize(self.div);
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
