renderToDiv = function (comp, optData) {
  var div = document.createElement("DIV");
  if (optData == null) {
    Blaze.renderComponent(comp, div);
  } else {
    var constructor =
          (typeof comp === 'function' ? comp : comp.constructor);
    Blaze.render(function () {
      return Blaze.With(optData, function () {
        return new constructor;
      });
    }).attach(div);
  }
  return div;
};
