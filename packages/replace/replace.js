Handlebars.registerHelper('replace', function (map, content) {
  str = content.fn(this);
  _.each(map, function (value) {
    str = str.replace(value.from, value.to);
  })
  return str;
});
