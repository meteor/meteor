renderToDiv = function (template, optData) {
  var div = document.createElement("DIV");
  if (optData == null) {
    Blaze.render({ 'content': template, 'parentElement': div });
  } else {
    Blaze.renderWithData({ 'content': template, 'parentElement': div }, optData);
  }
  return div;
};
