///// TOKENIZER AND PARSER COMBINATORS

// XXX make Parser object with parse method?
// XXX rework describe, call "expecting"?
// XXX track line/col position, for errors and maybe token info
// XXX unit tests

var isArray = function (obj) {
  return obj && (typeof obj === 'object') && (typeof obj.length === 'number');
};

Tokenizer = function (codeOrLexer) {
  // XXX rethink codeOrLexer later
  this.lexer = (codeOrLexer instanceof Lexer ? codeOrLexer :
                new Lexer(codeOrLexer));
  this.peekType = null;
  this.peekText = null;
  this.tokenType = null;
  this.tokenText = null;
  this.lastPos = 0;
  this.pos = 0;
  this.isLineTerminatorHere = false;

  // load peekType and peekText
  this.consume();
};

_.extend(Tokenizer.prototype, {
  // consumes the token (peekType, peekText) and moves
  // it into (type, text), loading the next token
  // into (peekType, peekText).  A token is a lexeme
  // besides WHITESPACE, COMMENT, and NEWLINE.
  consume: function () {
    var self = this;
    var lexer = self.lexer;
    self.type = self.peekType;
    self.text = self.peekText;
    self.lastPos = self.pos;
    self.isLineTerminatorHere = false;
    do {
      lexer.next();
      if (lexer.type === "ERROR")
        throw new Error("Bad token at position " + lexer.lastPos +
                        ", text `" + lexer.text + "`");
      else if (lexer.type === "NEWLINE")
        self.isLineTerminatorHere = true;
      else if (lexer.type === "COMMENT" && ! /^.*$/.test(lexer.text))
        // multiline comments containing line terminators count
        // as line terminators.
        self.isLineTerminatorHere = true;
    } while (lexer.type !== "EOF" && ! Lexer.isToken(lexer.type));
    self.peekType = lexer.type;
    self.peekText = lexer.text;
    self.pos = lexer.lastPos;
  }
});

// A parser that consume()s has to succeed.
// Similarly, a parser that fails can't have consumed.

// mutates the parser; don't describe an existing parser.
var describe = function (description, parser) {
  parser.description = description;
  return parser;
};

// Call this as `throw parseError(...)`.
// `expected` is a parser, `after` is a string.
var parseError = function (t, expected) {
  var str = (expected.description ? "Expected " + expected.description :
             // all parsers that might error should have descriptions,
             // but just in case:
             "Unexpected token");
  str += " after `" + t.text + "`";
  var pos = t.pos;
  str += " at position " + pos;
  str += ", found " + (t.peekText ? "`" + t.peekText + "`" : "EOF");
  var e = new Error(str);
  return e;
};

///// TERMINAL PARSER CONSTRUCTORS

var _tokenClassImpl = function (type, text, dontConsume) {
  var textSet = (text ? makeSet(text.split(' ')) : null);
  var description = (text ? text.split(' ').join(', ') : type);
  return describe(
    description,
    function (t) {
      if (t.peekType == type && (!text || textSet[t.peekText])) {
        if (dontConsume)
          return [];
        var ret = {text: t.peekText, pos: t.pos};
        t.consume();
        return ret;
      }
      return null;
    });
};

var _tokenImpl = function (text, dontConsume) {
  if (/\w/.test(text))
    return _tokenClassImpl('KEYWORD', text, dontConsume);
  return _tokenClassImpl('PUNCTUATION', text, dontConsume);
};

var tokenClass = function (type, text) {
  if (type === "ERROR" || type === "EOF")
    throw new Error("Can't create EOF or ERROR tokens, can only look ahead");
  return _tokenClassImpl(type, text);
};

var token = function (text) {
  return _tokenImpl(text);
};

// Like token, but marks tokens that need to defy the lexer's
// heuristic about whether the next '/' is a division or
// starts a regex.
var preSlashToken = function (text, divisionNotRegex) {
  var impl = _tokenImpl(text);
  return describe(impl.description,
                  function (t) {
                    // temporarily set divisionPermitted,
                    // restoring it if we don't match.
                    var oldValue = t.lexer.divisionPermitted;
                    var result;
                    try {
                      t.lexer.divisionPermitted = divisionNotRegex;
                      result = impl(t);
                      return result;
                    } finally {
                      if (! result)
                        t.lexer.divisionPermitted = oldValue;
                    }
                  });
};

// NON-CONSUMING PARSER CONSTRUCTORS

var lookAheadTokenClass = function (type, text) {
  return _tokenClassImpl(type, text, true);
};

var lookAheadToken = function (text) {
  return _tokenImpl(text, true);
};

///// NON-TERMINAL PARSER CONSTRUCTORS

// call as: runRequired(parser, tokenizer)
// to run parser(tokenizer) and assert it matches
var runRequired = function (parser, tokenizer) {
  return revalue(
    tokenizer ? parser(tokenizer) : parser,
    function (v, t) {
      if (! v)
        throw parseError(t || tokenizer, parser);
      return v;
    });
};

var runMaybeRequired = function (require, parser, tokenizer) {
  if (require)
    return runRequired(parser, tokenizer);
  else
    return parser(tokenizer);
};

// Polymorphic in parsers and results; an experiment.
var named = function (name, parserOrResult) {
  return describe(
    name,
    revalue(
      parserOrResult,
      function (value) {
        if (! value)
          return null;

        var result;
        if (isArray(value) && ! value.named)
          // bare array, prepend the name
          result = [name].concat(Array.prototype.slice.call(value));
        else
          // token or named array; construct a new named array
          result = [name, value];

        // don't name the same thing twice
        result.named = true;

        return result;
      }));
};

var or = function (/*parsers*/) {
  var args = arguments;
  return function (t) {
    var result;
    for(var i = 0, N = args.length; i < N; i++) {
      result = args[i](t);
      if (result)
        return result;
    }
    return null;
  };
};

// Parses a left-recursive expression with zero or more occurrences
// of a binary op.  Leaves the term unwrapped if no op.  For example
// (in a hypothetical use case):
// `1` => "1"
// `1+2` => ["binary", "1", "+", "2"]
// `1+2+3` => ["binary", ["binary", "1", "+", "2"], "+", "3"]
//
// opParser can also be an array of op parsers from high to low
// precedence (tightest-binding first)
var binaryLeft = function (termParser, opParser) {
  if (isArray(opParser)) {
    if (opParser.length === 1) {
      // take single opParser out of its array
      opParser = opParser[0];
    } else {
      // pop off last opParser (non-destructively) and replace
      // termParser with a recursive binaryLeft on the remaining
      // ops.
      termParser = binaryLeft(termParser, opParser.slice(0, -1));
      opParser = opParser[opParser.length - 1];
    }
  }

  return describe(
    termParser.description,
    function (t) {
      var result = termParser(t);
      if (! result)
        return null;

      var op;
      while ((op = opParser(t))) {
        result = named(
          'binary',
          [result, op, runRequired(termParser, t, op)]);
      }
      return result;
    });
};

// Parses a list of one or more items with a separator, listing the
// items and separators.  (Separator is optional.)  For example:
// `x` => ["x"]
// `x,y` => ["x", ",", "y"]
// `x,y,z` => ["x", ",", "y", ",", "z"]
// Respects `unpack`.
var list = function (itemParser, sepParser) {
  var push = function(array, newThing) {
    if (newThing.unpack)
      array.push.apply(array, newThing);
    else
      array.push(newThing);
  };
  return describe(
    itemParser.description,
    function (t) {
      var result = [];
      var firstItem = itemParser(t);
      if (! firstItem)
        return null;
      push(result, firstItem);

      if (sepParser) {
        var sep;
        while ((sep = sepParser(t))) {
          push(result, sep);
          push(result, runRequired(itemParser, t,
                                   sep.unpack ? sep[sep.length - 1] : sep));
        }
      } else {
        var item;
        while ((item = itemParser(t)))
          push(result, item);
      }
      return result;
    });
};

var seq = function (/*parsers*/) {
  var args = arguments;
  if (! args.length)
    return describe("(empty)",
                    function (t) { return []; });

  var description = args[0].description;
  for (var i = 1; i < args.length; i++)
    description += " " + args[i].description;
  return describe(
    description,
    function (t) {
      var result = [];
      for (var i = 0, N = args.length; i < N; i++) {
        // first item in sequence can fail, and we
        // fail (without error); after that, error on failure
        var r = runMaybeRequired(i > 0, args[i], t);
        if (! r)
          return null;

        if (r.unpack) // append array!
          result.push.apply(result, r);
        else
          result.push(r);
      }
      return result;
    });
};

var unpack = function (arrayParser) {
  return revalue(arrayParser, function (v) {
    if (v && isArray(v))
      v.unpack = true;
    return v;
  });
};

// lookAhead parser must never consume
var lookAhead = function (lookAheadParser, nextParser) {
  return describe(
    nextParser.description,
    function (t) {
      if (! lookAheadParser(t))
        return null;
      return nextParser(t);
    });
};
var negLookAhead = function (lookAheadParser, nextParser) {
  if (! nextParser)
    return function (t) {
      return lookAheadParser(t) ? null : [];
    };

  return describe(
    nextParser.description,
    function (t) {
      if (lookAheadParser(t))
        return null;
      return nextParser(t);
    });
};

// parser that looks at nothing and returns result
var constant = function (result) {
  // no description
  return function (t) {
    return result;
  };
};

// afterLookAhead allows the parser to fail rather than
// succeed if would otherwise fail at a position where
// afterLookAhead doesn't match, potentially providing
// a better error message.  For example, the illegal
// object literal `{true:1}` will stop at the `true`
// and say something like "expected property name"
// instead of "expected }".  As another example,
// `for(;var;) {}` will lead to "Expected expression"
// instead of "Expected ;" when the optional expression
// turns out to be an illegal `var`.
var opt = function (parser, afterLookAhead) {
  return describe(parser.description,
                  or(parser, afterLookAhead ? afterLookAhead : seq()));
};

// note: valueTransformFunc gets the tokenizer as a second argument
// if it's called on a parser.  This func is allowed to then
// run more parsers.
var revalue = function (parserOrValue, valueTransformFunc) {
  if (typeof valueTransformFunc !== 'function') {
    var value = valueTransformFunc;
    valueTransformFunc = function (v) {
      return (v ? value : null);
    };
  }

  if (typeof parserOrValue === 'function')
    // it's a parser
    return describe(parserOrValue.description,
                    function (t) {
                      return valueTransformFunc(parserOrValue(t), t);
                    });
  else
    return valueTransformFunc(parserOrValue);
};
