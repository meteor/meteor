// Cross-browser implementation of getting the computed style of an element.
getStyleProperty = function(n, prop) {
  if (n.currentStyle) {
    // camelCase it for IE
    return n.currentStyle[prop.replace(
      /-([a-z])/g,
      function(x,y) { return y.toUpperCase(); })];
  } else {
    return window.getComputedStyle(n, null).getPropertyValue(prop);
  }
};
