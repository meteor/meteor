// new Blaze.TextStringifier(options)
//
// An HTML.Visitor that turns HTMLjs into text, which may be
// used as part of an HTML tag attribute or the contents
// of a `<textarea>` or `<style>` tag, for example.
//
// Options: `parentView` (optional), `textMode` (required)
Blaze.TextStringifier = HTML.ToTextVisitor.extend();
Blaze.ToTextVisitor.def({
  visitObject: function (x) {
    if (x instanceof Blaze.View)
      return Blaze.viewToText(x, this.parentView, this.textMode);

    throw new Error("Unexpected object in htmljs in Blaze.viewToText: " + x);
  },
  // see comment in HTML.ToTextVisitor.visitTag
  toHTML: function (node) {
    var visitor = new Blaze.HTMLStringifier({parentView: this.parentView});
    return visitor.visit(node);
  }
});

// new Blaze.HTMLStringifier(options)
//
// An HTML.Visitor that turns HTMLjs into an HTML string.
//
// Options: `parentView`
Blaze.HTMLStringifier = HTML.ToHTMLVisitor.extend();
Blaze.HTMLStringifier.def({
  visitObject: function (x) {
    if (x instanceof Blaze.View)
      return Blaze.viewToHTML(x, this.parentView);

    throw new Error("Unexpected object in htmljs in Blaze.viewToHTML: " + x);
  },
  toText: function (node, textMode) {
    var visitor = new Blaze.TextStringifier({
      parentView: this.parentView,
      textMode: HTML.TEXTMODE.STRING
    });

    return visitor.visit(node);
  }
});
