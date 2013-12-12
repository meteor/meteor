if (Package.ui) {
  var UI = Package.ui.UI;
  Package.ui.Handlebars.registerHelper('markdown', UI.block(function () {
    var self;
    return function () {
      var text = UI.toRawText(self.__content);
      var converter = new Showdown.converter();
      return converter.makeHtml(text);
    };
  }));
}
