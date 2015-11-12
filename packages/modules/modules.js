meteorInstall = makeInstaller();

meteorInstall({
  node_modules: {
    modules: {
      "css.js": function (r, exports) {
        exports.addStyles = function (css) {
          var doc = document;
          var style = doc.createElement("style");

          style.setAttribute("type", "text/css");

          if (style.styleSheet) {
            style.styleSheet.cssText = css;
          } else {
            style.appendChild(doc.createTextNode(css));
          }

          return (
            doc.head ||
            doc.getElementsByTagName("head").item(0)
          ).appendChild(style);
        };
      }
    }
  }
});
