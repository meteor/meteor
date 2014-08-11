if (Package.templating) {
  var Template = Package.templating.Template;
  var UI = Package.ui.UI; // implied by `templating`
  var HTML = Package.htmljs.HTML; // implied by `ui`
  var Blaze = Package.blaze.Blaze; // implied by `ui`

  UI.registerHelper("markdown", new Template('markdown', function () {
    var view = this;
    var content = '';
    if (view.templateContentBlock) {
      content = Blaze._toText(view.templateContentBlock, HTML.TEXTMODE.STRING);
    }
    var converter = new Showdown.converter();
    return HTML.Raw(converter.makeHtml(content));
  }));
}
