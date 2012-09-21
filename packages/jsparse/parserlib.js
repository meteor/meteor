///// TOKENIZER AND PARSER COMBINATORS

(function () {

// XXX track line/col position, for errors and maybe token info

var isArray = function (obj) {
  return obj && (typeof obj === 'object') && (typeof obj.length === 'number');
};

ParseNode = function (name, children) {
  this.name = name;
  this.children = children;

  if (! isArray(children))
    throw new Error("Expected array in new ParseNode(" + name + ", ...)");
};


Parser = function (expecting, runFunc) {
  this.expecting = expecting;
  this._run = runFunc;
};

Parser.prototype.parse = function (t) {
  return this._run(t);
};

Parser.prototype.parseRequired = function (t) {
  return this.parseRequiredIf(t, true);
};

Parser.prototype.parseRequiredIf = function (t, required) {
  var result = this._run(t);

  if (required && ! result)
    throw t.getParseError(this.expecting);

  return result;
};

Parser.expecting = function (expecting, parser) {
  return new Parser(expecting, parser._run);
};


// A parser that consume()s has to succeed.
// Similarly, a parser that fails can't have consumed.

Parsers = {};

Parsers.assertion = function (test) {
  return new Parser(
    null, function (t) {
      return test(t) ? [] : null;
    });
};

Parsers.node = function (name, childrenParser) {
  return new Parser(name, function (t) {
    var children = childrenParser.parse(t);
    if (! children)
      return null;
    if (! isArray(children))
      children = [children];
    return new ParseNode(name, children);
  });
};

Parsers.or = function (/*parsers*/) {
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
Parsers.binaryLeft = function (name, termParser, opParsers) {
  var opParser;

  if (opParsers.length === 1) {
    // take single opParser out of its array
    opParser = opParsers[0];
  } else {
    // pop off last opParser (non-destructively) and replace
    // termParser with a recursive binaryLeft on the remaining
    // ops.
    termParser = Parsers.binaryLeft(name, termParser, opParsers.slice(0, -1));
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
          [result, op, termParser.parseRequired(t)]);
      }
      return result;
    });
};

Parsers.unary = function (name, termParser, opParser) {
  var unaryList = Parsers.opt(Parsers.list(opParser));
  return new Parser(
    termParser.expecting,
    function (t) {
      var unaries = unaryList.parse(t);
      // if we have unaries, we are committed and
      // have to match a term or error.
      var result = termParser.parseRequiredIf(t, unaries.length);
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
Parsers.list = function (itemParser, sepParser) {
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
          push(result, itemParser.parseRequired(t));
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
Parsers.seq = function (/*parsers*/) {
  var args = arguments;
  if (! args.length)
    return Parsers.constant([]);

  return new Parser(
    args[0].expecting,
    function (t) {
      var result = [];
      for (var i = 0, N = args.length; i < N; i++) {
        // first item in sequence can fail, and we
        // fail (without error); after that, error on failure
        var r = args[i].parseRequiredIf(t, i > 0);
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
Parsers.and = function (/*parsers*/) {
  var args = arguments;
  if (! args.length)
    return Parsers.constant([]);

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
Parsers.not = function (parser) {
  return new Parser(
    null,
    function (t) {
      return parser.parse(t) ? null : [];
    });
};

// parser that looks at nothing and returns result
Parsers.constant = function (result) {
  return new Parser(null,
                    function (t) { return result; });
};

Parsers.opt = function (parser) {
  return Parser.expecting(
    parser.expecting,
    Parsers.or(parser, Parsers.seq()));
};

Parsers.mapResult = function (parser, func) {
  return new Parser(
    parser.expecting,
    function (t) {
      var v = parser.parse(t);
      return v ? func(v, t) : null;
    });
};

Parsers.lazy = function (expecting, parserFunc) {
  var inner = null;
  return new Parser(expecting, function (t) {
    if (! inner)
      inner = parserFunc();
    return inner.parse(t);
  });
};

})();
