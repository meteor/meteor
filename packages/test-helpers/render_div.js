renderToDiv = function (template, optData) {
  const div = document.createElement("DIV");
  if (optData == null) {
    Blaze.render(template, div);
  } else {
    Blaze.renderWithData(template, optData, div);
  }
  return div;
};
