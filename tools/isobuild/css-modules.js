import LRU from "lru-cache";
import { load as isoLoad } from "../tool-env/isopackets.js";

const CACHE = new LRU({
  max: 1024 * 1024,
  length(value) {
    // The 40 here is the length of the hash key, and the value is the
    // CommonJS string that cssToCommonJS returns.
    return 40 + value.length;
  }
});

export function cssToCommonJS(css, hash) {
  if (hash && CACHE.has(hash)) {
    return CACHE.get(hash);
  }

  const { parseCss, stringifyCss } =
    isoLoad("css-tools")["minifier-css"].CssTools;

  const ast = parseCss(css);
  const rules = ast.stylesheet.rules;
  const lines = [];
  const earlyRules = [];

  rules.some((rule, i) => {
    if (rule.type === "rule") {
      rules.splice(0, i, ...earlyRules);
      // Once the actual CSS rules start, there can be no more @import
      // directives, so we can stop collecting earlyRules.
      return true;
    }

    if (rule.type === "import") {
      // Require the imported .css file, but omit the @import directive
      // from earlyRules, so that it won't be loaded that way.
      lines.push("require(" + JSON.stringify(rule.moduleIdentifier) + ");");
    } else {
      // Early rules (i.e. rules that come before the first normal CSS
      // rule) are typically either @import directives or comments.
      earlyRules.push(rule);
    }
  });

  lines.push(
    'module.exports = require("meteor/modules").addStyles(',
    "  " + JSON.stringify(stringifyCss(ast)),
    ");",
    ""
  );

  const commonJS = lines.join("\n");

  if (hash) {
    CACHE.set(hash, commonJS);
  }

  return commonJS;
}
