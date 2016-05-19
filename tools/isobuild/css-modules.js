export function cssToCommonJS(css) {
  return [
    'module.exports = require("meteor/modules").addStyles(',
    "  " + JSON.stringify(css),
    ");",
    ""
  ].join("\n");
}
