// Acorn is a tiny, fast JavaScript parser written in JavaScript.
//
// Acorn was written by Marijn Haverbeke, Ingvar Stepanyan, and
// various contributors and released under an MIT license.
//
// Git repositories for Acorn are available at
//
//     http://marijnhaverbeke.nl/git/acorn
//     https://github.com/acornjs/acorn.git
//
// Please use the [github bug tracker][ghbt] to report issues.
//
// [ghbt]: https://github.com/acornjs/acorn/issues
//
// This file defines the main parser interface. The library also comes
// with a [error-tolerant parser][dammit] and an
// [abstract syntax tree walker][walk], defined in other files.
//
// [dammit]: acorn_loose.js
// [walk]: util/walk.js

import {Parser} from "./state"
import "./parseutil"
import "./statement"
import "./lval"
import "./expression"
import "./location"
import "./scope"

export {Parser, plugins} from "./state"
export {defaultOptions} from "./options"
export {Position, SourceLocation, getLineInfo} from "./locutil"
export {Node} from "./node"
export {TokenType, types as tokTypes, keywords as keywordTypes} from "./tokentype"
export {TokContext, types as tokContexts} from "./tokencontext"
export {isIdentifierChar, isIdentifierStart} from "./identifier"
export {Token} from "./tokenize"
export {isNewLine, lineBreak, lineBreakG, nonASCIIwhitespace} from "./whitespace"

export const version = "5.5.3"

// The main exported interface (under `self.acorn` when in the
// browser) is a `parse` function that takes a code string and
// returns an abstract syntax tree as specified by [Mozilla parser
// API][api].
//
// [api]: https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API

export function parse(input, options) {
  return new Parser(options, input).parse()
}

// This function tries to parse a single expression at a given
// offset in a string. Useful for parsing mixed-language formats
// that embed JavaScript expressions.

export function parseExpressionAt(input, pos, options) {
  let p = new Parser(options, input, pos)
  p.nextToken()
  return p.parseExpression()
}

// Acorn is organized as a tokenizer and a recursive-descent parser.
// The `tokenizer` export provides an interface to the tokenizer.

export function tokenizer(input, options) {
  return new Parser(options, input)
}

// This is a terrible kludge to support the existing, pre-ES6
// interface where the loose parser module retroactively adds exports
// to this module.
export let parse_dammit, LooseParser, pluginsLoose // eslint-disable-line camelcase
export function addLooseExports(parse, Parser, plugins) {
  parse_dammit = parse // eslint-disable-line camelcase
  LooseParser = Parser
  pluginsLoose = plugins
}
