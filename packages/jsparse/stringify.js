// The "tree string" format is a simple format for representing syntax trees.
//
// For example, the parse of `x++;` is written as:
// "program(expressionStmnt(postfix(identifier(x) ++) ;))"
//
// A Node is written as "name(item1 item2 item3)", with additional whitespace
// allowed anywhere between the name, parentheses, and items.
//
// Tokens don't need to be escaped unless they contain '(', ')', whitespace, or
// backticks, or are empty.  If they do, they can be written enclosed in backticks.
// To escape a backtick within backticks, double it.
//
// `stringify` generates "canonical" tree strings, which have no extra escaping
// or whitespace, just one space between items in a Node.


ParseNode.prototype.stringify = function () {
  return ParseNode.stringify(this);
};

var backtickEscape = function (str) {
  if (/[\s()`]/.test(str))
    return '`' + str.replace(/`/g, '``') + '`';
  else if (! str)
    return '``';
  else
    return str;
};

var backtickUnescape = function (str) {
  if (str.charAt(0) === '`') {
    if (str.length === 1 || str.slice(-1) !== '`')
      throw new Error("Mismatched ` in " + str);
    if (str.length === 2)
      str = '';
    else
      str = str.slice(1, -1).replace(/``/g, '`');
  }
  return str;
};

ParseNode.stringify = function (tree) {
  if (tree instanceof ParseNode) {
    var str = backtickEscape(tree.name);
    str += '(';
    var escapedChildren = [];
    for(var i = 0, N = tree.children.length; i < N; i++)
      escapedChildren.push(ParseNode.stringify(tree.children[i]));
    str += escapedChildren.join(' ');
    str += ')';
    return str;
  }

  // Treat a token object or string as a token.
  if (typeof tree.text === 'function')
    tree = tree.text();
  else if (typeof tree.text === 'string')
    tree = tree.text;
  return backtickEscape(String(tree));
};

ParseNode.unstringify = function (str) {
  var lexemes = str.match(/\(|\)|`([^`]||``)*`|`|[^\s()`]+/g) || [];
  var N = lexemes.length;
  var state = {
    i: 0,
    getParseError: function (expecting) {
      throw new Error("unstringify: Expecting " + expecting +", found " +
                      (lexemes[this.i] || "end of string"));
    },
    peek: function () { return lexemes[this.i]; },
    advance: function () { this.i++; }
  };
  var paren = function (chr) {
    return new Parser(chr, function (t) {
      if (t.peek() !== chr)
        return null;
      t.advance();
      return chr;
    });
  };
  var EMPTY_STRING = [""];
  var token = new Parser('token', function (t) {
    var txt = t.peek();
    if (!txt || txt.charAt(0) === '(' || txt.charAt(0) === ')')
      return null;

    t.advance();
    // can't return falsy value from successful parser
    return backtickUnescape(txt) || EMPTY_STRING;
  });

  // Make "item" lazy so it can be recursive.
  var item = Parsers.lazy('token', function () { return item; });

  // Parse a single node or token.
  item = Parsers.mapResult(
    Parsers.seq(token,
                Parsers.opt(Parsers.seq(
                  paren('('), Parsers.opt(Parsers.list(item)), paren(')')))),
    function (v) {
      for(var i = 0, N = v.length; i < N; i++)
        if (v[i] === EMPTY_STRING)
          v[i] = "";

      if (v.length === 1)
        // token
        return v[0];
      // node. exclude parens
      return new ParseNode(v[0], v.slice(2, -1));
    });

  var endOfString = new Parser("end of string", function (t) {
    return t.i === N ? [] : null;
  });

  return Parsers.seq(item, endOfString).parseRequired(state)[0];
};
