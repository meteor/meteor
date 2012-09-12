///// TOKENIZER AND PARSER COMBINATORS

// XXX track line/col position, for errors and maybe token info
// XXX unit tests

var isArray = function (obj) {
  return obj && (typeof obj === 'object') && (typeof obj.length === 'number');
};

var ParseNode = function (name, children) {
  this.name = name;
  this.children = children;

  if (! isArray(children))
    throw new Error("Expected array in new ParseNode(" + name + ", ...)");
};

var Parser = function (expecting, runFunc) {
  this.expecting = expecting;
  this._run = runFunc;
};

_.extend(Parser.prototype, {
  parse: function (t, options) {
    var result = this._run(t);

    if (options) {
      if (options.required && ! result)
        throw parseError(t, this);
    }

    return result;
  }
});

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

// mutates the parser
var expecting = function (expecting, parser) {
  parser.expecting = expecting;
  return parser;
};

// Call this as `throw parseError(...)`.
// `expected` is a parser, `after` is a string.
var parseError = function (t, expectedParser, found) {
  var str = (expectedParser.expecting ? "Expected " +
             expectedParser.expecting :
             // all parsers that might error should have descriptions,
             // but just in case:
             "Unexpected token");
  str += " after `" + t.text + "`";
  var pos = t.pos;
  str += " at position " + pos;
  str += ", found " + (found || (t.peekText ? "`" + t.peekText + "`" : "EOF"));
  var e = new Error(str);
  return e;
};

///// TERMINAL PARSER CONSTRUCTORS

var _tokenClassImpl = function (type, text, onlyLook) {
  var textSet = (text ? makeSet(text.split(' ')) : null);
  var expecting = (text ? text.split(' ').join(', ') : type);
  return new Parser(
    expecting,
    function (t) {
      if (t.peekType == type && (!text || textSet[t.peekText])) {
        if (onlyLook)
          return [];
        var ret = {text: t.peekText, pos: t.pos};
        t.consume();
        return ret;
      }
      return null;
    });
};

var _tokenImpl = function (text, onlyLook) {
  if (/\w/.test(text))
    return _tokenClassImpl('KEYWORD', text, onlyLook);
  return _tokenClassImpl('PUNCTUATION', text, onlyLook);
};

var tokenClass = function (type, text) {
  if (type === "ERROR" || type === "EOF")
    throw new Error("Can't create EOF or ERROR tokens, can only look ahead");
  return _tokenClassImpl(type, text);
};

var token = function (text) {
  return _tokenImpl(text);
};

// NON-CONSUMING PARSER CONSTRUCTORS

var lookAheadTokenClass = function (type, text) {
  return _tokenClassImpl(type, text, true);
};

var lookAheadToken = function (text) {
  return _tokenImpl(text, true);
};

var assertion = function (test) {
  return new Parser(
    null, function (t) {
      return test(t) ? [] : null;
    });
};

///// NON-TERMINAL PARSER CONSTRUCTORS

var node = function (name, childrenParser) {
  return new Parser(name, function (t) {
    var children = childrenParser.parse(t);
    if (! children)
      return null;
    if (! isArray(children))
      children = [children];
    return new ParseNode(name, children);
  });
};

var or = function (/*parsers*/) {
  var args = arguments;
  return new Parser(
    args[args.length - 1].expecting,
    function (t) {
      var result;
      for(var i = 0, N = args.length; i < N; i++) {
        result = args[i].parse(t);
        if (result)
          return result;
      }
      return null;
    });
};

// Parses a left-recursive expression with zero or more occurrences
// of a binary op.  Leaves the term unwrapped if no op.  For example
// (in a hypothetical use case):
// `1` => "1"
// `1+2` => ["binary", "1", "+", "2"]
// `1+2+3` => ["binary", ["binary", "1", "+", "2"], "+", "3"]
//
// opParsers is an array of op parsers from high to low
// precedence (tightest-binding first)
var binaryLeft = function (name, termParser, opParsers) {
  var opParser;

  if (opParsers.length === 1) {
    // take single opParser out of its array
    opParser = opParsers[0];
  } else {
    // pop off last opParser (non-destructively) and replace
    // termParser with a recursive binaryLeft on the remaining
    // ops.
    termParser = binaryLeft(name, termParser, opParsers.slice(0, -1));
    opParser = opParsers[opParsers.length - 1];
  }

  return new Parser(
    termParser.expecting,
    function (t) {
      var result = termParser.parse(t);
      if (! result)
        return null;

      var op;
      while ((op = opParser.parse(t))) {
        result = new ParseNode(
          name,
          [result, op, termParser.parse(t, {required: true})]);
      }
      return result;
    });
};

var unary = function (name, termParser, opParser) {
  var unaryList = opt(list(opParser));
  return new Parser(
    termParser.expecting,
    function (t) {
      var unaries = unaryList.parse(t);
      // if we have unaries, we are committed and
      // have to match an expression or error.
      var result = termParser.parse(
        t, {required: unaries.length});
      if (! result)
        return null;

      while (unaries.length)
        result = new ParseNode(name, [unaries.pop(), result]);
      return result;
    });
};

// Parses a list of one or more items with a separator, listing the
// items and separators.  (Separator is optional.)  For example:
// `x` => ["x"]
// `x,y` => ["x", ",", "y"]
// `x,y,z` => ["x", ",", "y", ",", "z"]
// Unpacks.
var list = function (itemParser, sepParser) {
  var push = function(array, newThing) {
    if (isArray(newThing))
      array.push.apply(array, newThing);
    else
      array.push(newThing);
  };
  return new Parser(
    itemParser.expecting,
    function (t) {
      var result = [];
      var firstItem = itemParser.parse(t);
      if (! firstItem)
        return null;
      push(result, firstItem);

      if (sepParser) {
        var sep;
        while ((sep = sepParser.parse(t))) {
          push(result, sep);
          push(result, itemParser.parse(t, {required: true}));
        }
      } else {
        var item;
        while ((item = itemParser.parse(t)))
          push(result, item);
      }
      return result;
    });
};

// Unpacks arrays (nested seqs).
var seq = function (/*parsers*/) {
  var args = arguments;
  if (! args.length)
    return constant([]);

  return new Parser(
    args[0].expecting,
    function (t) {
      var result = [];
      for (var i = 0, N = args.length; i < N; i++) {
        // first item in sequence can fail, and we
        // fail (without error); after that, error on failure
        var r = args[i].parse(t, {required: i > 0});
        if (! r)
          return null;

        if (isArray(r)) // append array!
          result.push.apply(result, r);
        else
          result.push(r);
      }
      return result;
    });
};

// parsers except last must never consume
var and = function (/*parsers*/) {
  var args = arguments;
  if (! args.length)
    return constant([]);

  return new Parser(
    args[args.length - 1].expecting,
    function (t) {
      var result;
      for(var i = 0, N = args.length; i < N; i++) {
        result = args[i].parse(t);
        if (! result)
          return null;
      }
      return result;
    });
};

// parser must not consume
var not = function (parser) {
  return new Parser(
    null,
    function (t) {
      return parser.parse(t) ? null : [];
    });
};

// parser that looks at nothing and returns result
var constant = function (result) {
  return new Parser(null,
                    function (t) { return result; });
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
var opt = function (parser) {
  return expecting(parser.expecting,
                   or(parser, seq()));
};

var mapResult = function (parser, func) {
  return new Parser(
    parser.expecting,
    function (t) {
      var v = parser.parse(t);
      return v ? func(v, t) : null;
    });
};
