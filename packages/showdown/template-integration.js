if (Package.blaze) {
  var Blaze = Package.blaze.Blaze;
  var HTML = Package.htmljs.HTML; // implied by `ui`

  UI.registerHelper("markdown", Template.__create__('markdown', function () {
    var view = this;
    var content = '';
    if (view.templateContentBlock) {
      content = Blaze.toText(view.templateContentBlock, HTML.TEXTMODE.STRING);
    }
    var converter = new Showdown.converter();
    return HTML.Raw(converter.makeHtml(content));
  }));
}
