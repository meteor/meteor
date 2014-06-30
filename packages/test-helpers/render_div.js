renderToDiv = function (template, optData) {
  var div = document.createElement("DIV");
  if (optData == null) {
    Blaze.render(template).attach(div);
  } else {
    Blaze.render(function () {
      return Blaze.With(optData, function () {
        return template;
      });
    }).attach(div);
  }
  return div;
};
