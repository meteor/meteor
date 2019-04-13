export function cssToCommonJS(css: string) {
  return [
    'module.exports = require("meteor/modules").addStyles(',
    "  " + JSON.stringify(css),
    ");",
    ""
  ].join("\n");
}
