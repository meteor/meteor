renderToDiv = function (template, optData) {
  var div = document.createElement("DIV");
  if (optData == null) {
    UI.insert(UI.render(template), div);
  } else {
    UI.insert(UI.render(function () {
      return Blaze.With(optData, function () {
        return template;
      });
    }), div);
  }
  return div;
};
