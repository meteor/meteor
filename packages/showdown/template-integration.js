Handlebars.registerHelper('markdown', function (options) {
  var converter = new Showdown.converter();
  return converter.makeHtml(options.fn(this));
});
