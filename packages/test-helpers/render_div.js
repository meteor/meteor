renderToDiv = function (template, optData) {
  var div = document.createElement("DIV");
  if (optData == null) {
    Blaze.render(template, div);
  } else {
    Blaze.render(template, div, { data: optData });
  }
  return div;
};
