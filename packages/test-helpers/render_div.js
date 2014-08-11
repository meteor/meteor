renderToDiv = function (template, optData) {
  var div = document.createElement("DIV");
  if (optData == null) {
    UI.insert(UI.render(template), div);
  } else {
    UI.insert(UI.renderWithData(template, optData), div);
  }
  return div;
};
