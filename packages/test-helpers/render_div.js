renderToDiv = function (template, optData) {
  var div = document.createElement("DIV");
  if (optData == null) {
    UI.render(template, div);
  } else {
    UI.renderWithData(template, optData, div);
  }
  return div;
};
