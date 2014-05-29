renderToDiv = function (comp) {
  var div = document.createElement("DIV");
  UI.materialize(comp, div);
  return div;
};
