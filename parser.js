"use strict";

const babelParser = require("@babel/parser");
const babelParserVersion = require("@babel/parser/package.json").version;
const defaultParserOptions = require("reify/lib/parsers/babel.js").options;

function parse(code, parserOptions) {
  return babelParser.parse(code, parserOptions || defaultParserOptions);
}

function tolerantParse(code, parserOptions) {
  const arrayFrom = Array.from;
  // There is only one use of Array.from in the @babel/parser@7.4.x code,
  // Array.from(this.scope.undefinedExports), which determines whether the
  // parser complains prematurely about exporting identifiers that were
  // not declared in the current module scope. By returning an empty array
  // when the source argument is a Map, we can effectively disable that
  // error behavior, until https://github.com/babel/babel/pull/9864 is
  // released in @babel/parser@7.5.0.
  Array.from = function (source) {
    return source instanceof Map ? [] : arrayFrom.apply(this, arguments);
  };
  try {
    return parse(code, parserOptions);
  } finally {
    Array.from = arrayFrom;
  }
}

exports.parse = babelParserVersion.startsWith("7.4.") ? tolerantParse : parse;
