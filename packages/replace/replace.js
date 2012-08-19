Handlebars.registerHelper('replace', function (map, content) {
  str = content.fn(this);
  _.each(map, function (value) {
    if (! (value.from instanceof RegExp)) {
      fromSafe = String(value.from).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      value.from = new RegExp(fromSafe, 'g');
    }
    str = str.replace(value.from, value.to);
  })
  return str;
});
