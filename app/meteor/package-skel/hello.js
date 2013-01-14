Handlebars.registerHelper("hello", function (options) {
  return new Handlebars.SafeString(Template.hello());
});
