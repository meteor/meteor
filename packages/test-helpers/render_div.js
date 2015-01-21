renderToDiv = function (template, optData) {
  var div = document.createElement("DIV");
  if (optData == null) {
    Blaze.render(template, div);
  } else {
    Blaze.renderWithData(template, optData, div);
  }
  return div;
};
