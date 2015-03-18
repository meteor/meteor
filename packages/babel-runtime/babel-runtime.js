// The name `babelHelpers` is hard-coded in Babel.  Otherwise we would make it
// something capitalized and more descriptive, like `BabelRuntime`.
babelHelpers = {
  taggedTemplateLiteral: function (strings, raw) {
    // Babel's own version of this calls Object.freeze on `strings` and
    // `strings.raw`, but it doesn't seem worth the compatibility and
    // performance concerns.  If you're writing code against this helper,
    // don't add properties to these objects.
    strings.raw = { value: raw };
    return strings;
  }
};
