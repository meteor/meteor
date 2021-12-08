"use strict";

const babelParser = require("@babel/parser");
const defaultParserOptions = require("reify/lib/parsers/babel.js").options;

function parse(code, parserOptions) {
  return babelParser.parse(code, parserOptions || defaultParserOptions);
}

exports.parse = parse;
