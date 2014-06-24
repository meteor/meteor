if (Package.blaze) {
  var Blaze = Package.blaze.Blaze;
  var HTML = Package.htmljs.HTML; // implied by `ui`

  Blaze.MarkdownComponent = function (dataFunc, contentFunc) {
    Blaze.MarkdownComponent.__super__.constructor.call(this);
    this.contentFunc = contentFunc;
  };
  JSClass.inherits(Blaze.MarkdownComponent, Blaze.Component);
  Blaze.MarkdownComponent.prototype.render = function () {
    var text = Blaze.toText(this.contentFunc, HTML.TEXTMODE.STRING);
    var converter = new Showdown.converter();
    return HTML.Raw(converter.makeHtml(text));
  };

  UI.registerHelper("markdown", Blaze.MarkdownComponent.prototype);
}
