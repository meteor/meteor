
var getExpression,
    getExpressionList,
    makePrefixSequenceMatcher,
    makeInfixSequenceMatcher,
    getBracketedExpression,
    getPrimary,
    getMember,
    getInvocation,
    getInvocationRefinement,
    getTypeOf,
    getLogicalOr,
    getConditional,

    getDigits,
    getExponent,
    getFraction,
    getInteger,

    getReference,
    getRefinement,

    getLiteral,
    getArrayLiteral,
    getBooleanLiteral,
    getNumberLiteral,
    getStringLiteral,
    getObjectLiteral,
    getGlobal,

    getKeyValuePairs,
    getKeyValuePair,
    getKey,

    getName,

    getDotRefinement,
    getArrayRefinement,
    getArrayMember,

    globals;

RExpr.parse = function (str) {
  var tokenizer = {
    str: str,
    pos: 0,
    remaining: function () {
      return tokenizer.str.substring( tokenizer.pos );
    }
  };

  return getExpression(tokenizer);
};

getExpression = function ( tokenizer ) {
  // The conditional operator is the lowest precedence operator (except yield,
  // assignment operators, and commas, none of which are supported), so we
  // start there. If it doesn't match, it 'falls through' to progressively
  // higher precedence operators, until it eventually matches (or fails to
  // match) a 'primary' - a literal or a reference. This way, the abstract syntax
  // tree has everything in its proper place, i.e. 2 + 3 * 4 === 14, not 20.
  return getConditional( tokenizer );
};

getExpressionList = function ( tokenizer ) {
  var start, expressions, expr, next;

  start = tokenizer.pos;

  allowWhitespace( tokenizer );

  expr = getExpression( tokenizer );

  if ( expr === null ) {
    return null;
  }

  expressions = [ expr ];

  // allow whitespace between expression and ','
  allowWhitespace( tokenizer );

  if ( getStringMatch( tokenizer, ',' ) ) {
    next = getExpressionList( tokenizer );
    if ( next === null ) {
      tokenizer.pos = start;
      return null;
    }

    expressions = expressions.concat( next );
  }

  return expressions;
};

getBracketedExpression = function ( tokenizer ) {
  var start, expr;

  start = tokenizer.pos;

  if ( !getStringMatch( tokenizer, '(' ) ) {
    return null;
  }

  allowWhitespace( tokenizer );

  expr = getExpression( tokenizer );
  if ( !expr ) {
    tokenizer.pos = start;
    return null;
  }

  allowWhitespace( tokenizer );

  if ( !getStringMatch( tokenizer, ')' ) ) {
    tokenizer.pos = start;
    return null;
  }

  return {
    t: RExpr.BRACKETED,
    x: expr
  };
};

getPrimary = function ( tokenizer ) {
  return getLiteral( tokenizer )
    || getReference( tokenizer )
    || getBracketedExpression( tokenizer );
};

getMember = function ( tokenizer ) {
  var expression, refinement, member;

  expression = getPrimary( tokenizer );
  if ( !expression ) {
    return null;
  }

  refinement = getRefinement( tokenizer );
  if ( !refinement ) {
    return expression;
  }

  while ( refinement !== null ) {
    member = {
      t: RExpr.MEMBER,
      x: expression,
      r: refinement
    };

    expression = member;
    refinement = getRefinement( tokenizer );
  }

  return member;
};

getInvocation = function ( tokenizer ) {
  var start, expression, expressionList, result;

  expression = getMember( tokenizer );
  if ( !expression ) {
    return null;
  }

  start = tokenizer.pos;

  if ( !getStringMatch( tokenizer, '(' ) ) {
    return expression;
  }

  allowWhitespace( tokenizer );
  expressionList = getExpressionList( tokenizer );

  allowWhitespace( tokenizer );

  if ( !getStringMatch( tokenizer, ')' ) ) {
    tokenizer.pos = start;
    return expression;
  }

  result = {
    t: RExpr.INVOCATION,
    x: expression
  };

  if ( expressionList ) {
    result.o = expressionList;
  }

  return result;
};

getInvocationRefinement = function ( tokenizer ) {
  var expression, refinement, member;

  expression = getInvocation( tokenizer );
  if ( !expression ) {
    return null;
  }

  if ( expression.t !== RExpr.INVOCATION ) {
    return expression;
  }

  refinement = getRefinement( tokenizer );
  if ( !refinement ) {
    return expression;
  }

  while ( refinement !== null ) {
    member = {
      t: RExpr.MEMBER,
      x: expression,
      r: refinement
    };

    expression = member;
    refinement = getRefinement( tokenizer );
  }

  return member;
};

// right-to-left
makePrefixSequenceMatcher = function ( symbol, fallthrough ) {
  return function ( tokenizer ) {
    var start, expression;

    if ( !getStringMatch( tokenizer, symbol ) ) {
      return fallthrough( tokenizer );
    }

    start = tokenizer.pos;

    allowWhitespace( tokenizer );

    expression = getTypeOf( tokenizer );
    if ( !expression ) {
      fail( tokenizer, 'an expression' );
    }

    return {
      s: symbol,
      o: expression,
      t: RExpr.PREFIX_OPERATOR
    };
  };
};

// create all prefix sequence matchers
(function () {
  var i, len, matcher, prefixOperators, fallthrough;

  prefixOperators = '! ~ + - typeof'.split( ' ' );

  // An invocation refinement is higher precedence than logical-not
  fallthrough = getInvocationRefinement;
  for ( i=0, len=prefixOperators.length; i<len; i+=1 ) {
    matcher = makePrefixSequenceMatcher( prefixOperators[i], fallthrough );
    fallthrough = matcher;
  }

  // typeof operator is higher precedence than multiplication, so provides the
  // fallthrough for the multiplication sequence matcher we're about to create
  // (we're skipping void and delete)
  getTypeOf = fallthrough;
}());


makeInfixSequenceMatcher = function ( symbol, fallthrough ) {
  return function ( tokenizer ) {
    var start, left, right;

    left = fallthrough( tokenizer );
    if ( !left ) {
      return null;
    }

    // Loop to handle left-recursion in a case like `a * b * c` and produce
    // left association, i.e. `(a * b) * c`.
    while (true) {
      start = tokenizer.pos;

      allowWhitespace( tokenizer );

      if ( !getStringMatch( tokenizer, symbol ) ) {
        tokenizer.pos = start;
        return left;
      }

      // special case - in operator must not be followed by [a-zA-Z_$0-9]
      if ( symbol === 'in' && /[a-zA-Z_$0-9]/.test( tokenizer.remaining().charAt( 0 ) ) ) {
        tokenizer.pos = start;
        return left;
      }

      allowWhitespace( tokenizer );

      // right operand must consist of only lower-precedence operators
      right = fallthrough( tokenizer );
      if ( !right ) {
        tokenizer.pos = start;
        return left;
      }

      left = {
        t: RExpr.INFIX_OPERATOR,
        s: symbol,
        o: [ left, right ]
      };
    }
  };
};

// create all infix sequence matchers
(function () {
  var i, len, matcher, infixOperators, fallthrough;

  // All the infix operators on order of precedence (source: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Operators/Operator_Precedence)
  // Each sequence matcher will initially fall through to its higher precedence
  // neighbour, and only attempt to match if one of the higher precedence operators
  // (or, ultimately, a literal, reference, or bracketed expression) already matched
  infixOperators = '* / % + - << >> >>> < <= > >= in instanceof == != === !== & ^ | && ||'.split( ' ' );

  // A typeof operator is higher precedence than multiplication
  fallthrough = getTypeOf;
  for ( i=0, len=infixOperators.length; i<len; i+=1 ) {
    matcher = makeInfixSequenceMatcher( infixOperators[i], fallthrough );
    fallthrough = matcher;
  }

  // Logical OR is the fallthrough for the conditional matcher
  getLogicalOr = fallthrough;
}());


// The conditional operator is the lowest precedence operator, so we start here
getConditional = function ( tokenizer ) {
  var start, expression, ifTrue, ifFalse;

  expression = getLogicalOr( tokenizer );
  if ( !expression ) {
    return null;
  }

  start = tokenizer.pos;

  allowWhitespace( tokenizer );

  if ( !getStringMatch( tokenizer, '?' ) ) {
    tokenizer.pos = start;
    return expression;
  }

  allowWhitespace( tokenizer );

  ifTrue = getExpression( tokenizer );
  if ( !ifTrue ) {
    tokenizer.pos = start;
    return expression;
  }

  allowWhitespace( tokenizer );

  if ( !getStringMatch( tokenizer, ':' ) ) {
    tokenizer.pos = start;
    return expression;
  }

  allowWhitespace( tokenizer );

  ifFalse = getExpression( tokenizer );
  if ( !ifFalse ) {
    tokenizer.pos = start;
    return expression;
  }

  return {
    t: RExpr.CONDITIONAL,
    o: [ expression, ifTrue, ifFalse ]
  };
};



getDigits = getRegexMatcher( /^[0-9]+/ );
getExponent = getRegexMatcher( /^[eE][\-+]?[0-9]+/ );
getFraction = getRegexMatcher( /^\.[0-9]+/ );
getInteger = getRegexMatcher( /^(0|[1-9][0-9]*)/ );


getReference = function ( tokenizer ) {
  var startPos, name, dot, combo, refinement, lastDotIndex;

  startPos = tokenizer.pos;

  // could be an implicit iterator ('.'), a prefixed reference ('.name') or a
  // standard reference ('name')
  dot = getStringMatch( tokenizer, '.' ) || '';
  name = getName( tokenizer ) || '';

  // allow the use of `this`
  if ( name === 'this' ) {
    name = '.';
    startPos += 3; // horrible hack to allow method invocations with `this` by ensuring combo.length is right!
  }

  combo = dot + name;

  if ( !combo ) {
    return null;
  }

  while ( refinement = getDotRefinement( tokenizer ) || getArrayRefinement( tokenizer ) ) {
    combo += refinement;
  }

  if ( getStringMatch( tokenizer, '(' ) ) {

    // if this is a method invocation (as opposed to a function) we need
    // to strip the method name from the reference combo, else the context
    // will be wrong
    lastDotIndex = combo.lastIndexOf( '.' );
    if ( lastDotIndex !== -1 ) {
      combo = combo.substr( 0, lastDotIndex );
      tokenizer.pos = startPos + combo.length;
    } else {
      tokenizer.pos -= 1;
    }
  }

  return {
    t: RExpr.REFERENCE,
    n: combo
  };
};

getRefinement = function ( tokenizer ) {
  var start, name, expr;

  start = tokenizer.pos;

  allowWhitespace( tokenizer );

  // "." name
  if ( getStringMatch( tokenizer, '.' ) ) {
    allowWhitespace( tokenizer );

    if ( name = getName( tokenizer ) ) {
      return {
	t: RExpr.REFINEMENT,
	n: name
      };
    }

    fail( tokenizer, 'a property name' );
  }

  // "[" expression "]"
  if ( getStringMatch( tokenizer, '[' ) ) {
    allowWhitespace( tokenizer );

    expr = getExpression( tokenizer );
    if ( !expr ) {
      fail( tokenizer, 'an expression' );
    }

    allowWhitespace( tokenizer );

    if ( !getStringMatch( tokenizer, ']' ) ) {
      fail( tokenizer, '"]"' );
    }

    return {
      t: RExpr.REFINEMENT,
      x: expr
    };
  }

  return null;
};

// Any literal except function and regexp literals, which aren't supported (yet?)
getLiteral = function ( tokenizer ) {
  var literal = getNumberLiteral( tokenizer )   ||
	getBooleanLiteral( tokenizer )  ||
	getGlobal( tokenizer )          ||
	getStringLiteral( tokenizer )   ||
	getObjectLiteral( tokenizer )   ||
	getArrayLiteral( tokenizer );

  return literal;
};

getArrayLiteral = function ( tokenizer ) {
  var start, expressionList;

  start = tokenizer.pos;

  // allow whitespace before '['
  allowWhitespace( tokenizer );

  if ( !getStringMatch( tokenizer, '[' ) ) {
    tokenizer.pos = start;
    return null;
  }

  expressionList = getExpressionList( tokenizer );

  if ( !getStringMatch( tokenizer, ']' ) ) {
    tokenizer.pos = start;
    return null;
  }

  return {
    t: RExpr.ARRAY_LITERAL,
    m: expressionList
  };
};

getBooleanLiteral = function ( tokenizer ) {
  var remaining = tokenizer.remaining();

  if ( remaining.substr( 0, 4 ) === 'true' ) {
    tokenizer.pos += 4;
    return {
      t: RExpr.BOOLEAN_LITERAL,
      v: 'true'
    };
  }

  if ( remaining.substr( 0, 5 ) === 'false' ) {
    tokenizer.pos += 5;
    return {
      t: RExpr.BOOLEAN_LITERAL,
      v: 'false'
    };
  }

  return null;
};

globals = /^(?:Array|Date|RegExp|decodeURIComponent|decodeURI|encodeURIComponent|encodeURI|isFinite|isNaN|parseFloat|parseInt|JSON|Math|NaN|undefined|null)/;

// Not strictly literals, but we can treat them as such because they
// never need to be dereferenced.

// Allowed globals:
// ----------------
//
// Array, Date, RegExp, decodeURI, decodeURIComponent, encodeURI, encodeURIComponent, isFinite, isNaN, parseFloat, parseInt, JSON, Math, NaN, undefined, null
getGlobal = function ( tokenizer ) {
  var start, name, match;

  start = tokenizer.pos;
  name = getName( tokenizer );

  if ( !name ) {
    return null;
  }

  match = globals.exec( name );
  if ( match ) {
    tokenizer.pos = start + match[0].length;
    return {
      t: RExpr.GLOBAL,
      v: match[0]
    };
  }

  tokenizer.pos = start;
  return null;
};

getNumberLiteral = function ( tokenizer ) {
  var start, result;

  start = tokenizer.pos;

  // special case - we may have a decimal without a literal zero (because
  // some programmers are plonkers)
  if ( result = getFraction( tokenizer ) ) {
    return {
      t: RExpr.NUMBER_LITERAL,
      v: result
    };
  }

  result = getInteger( tokenizer );
  if ( result === null ) {
    return null;
  }

  result += getFraction( tokenizer ) || '';
  result += getExponent( tokenizer ) || '';

  return {
    t: RExpr.NUMBER_LITERAL,
    v: result
  };
};

getObjectLiteral = function ( tokenizer ) {
  var start, keyValuePairs;

  start = tokenizer.pos;

  // allow whitespace
  allowWhitespace( tokenizer );

  if ( !getStringMatch( tokenizer, '{' ) ) {
    tokenizer.pos = start;
    return null;
  }

  keyValuePairs = getKeyValuePairs( tokenizer );

  // allow whitespace between final value and '}'
  allowWhitespace( tokenizer );

  if ( !getStringMatch( tokenizer, '}' ) ) {
    tokenizer.pos = start;
    return null;
  }

  return {
    t: RExpr.OBJECT_LITERAL,
    m: keyValuePairs
  };
};

getKeyValuePairs = function ( tokenizer ) {
  var start, pairs, pair, keyValuePairs;

  start = tokenizer.pos;

  pair = getKeyValuePair( tokenizer );
  if ( pair === null ) {
    return null;
  }

  pairs = [ pair ];

  if ( getStringMatch( tokenizer, ',' ) ) {
    keyValuePairs = getKeyValuePairs( tokenizer );

    if ( !keyValuePairs ) {
      tokenizer.pos = start;
      return null;
    }

    return pairs.concat( keyValuePairs );
  }

  return pairs;
};

getKeyValuePair = function ( tokenizer ) {
  var start, key, value;

  start = tokenizer.pos;

  // allow whitespace between '{' and key
  allowWhitespace( tokenizer );

  key = getKey( tokenizer );
  if ( key === null ) {
    tokenizer.pos = start;
    return null;
  }

  // allow whitespace between key and ':'
  allowWhitespace( tokenizer );

  // next character must be ':'
  if ( !getStringMatch( tokenizer, ':' ) ) {
    tokenizer.pos = start;
    return null;
  }

  // allow whitespace between ':' and value
  allowWhitespace( tokenizer );

  // next expression must be a, well... expression
  value = getExpression( tokenizer );
  if ( value === null ) {
    tokenizer.pos = start;
    return null;
  }

  return {
    t: RExpr.KEY_VALUE_PAIR,
    k: key,
    v: value
  };
};

// http://mathiasbynens.be/notes/javascript-properties
// can be any name, string literal, or number literal
getKey = function ( tokenizer ) {
  return getName( tokenizer ) || getStringLiteral( tokenizer ) || getNumberLiteral( tokenizer );
};

getStringLiteral = function ( tokenizer ) {
  var start, string;

  start = tokenizer.pos;

  if ( getStringMatch( tokenizer, '"' ) ) {
    string = getDoubleQuotedString( tokenizer );

    if ( !getStringMatch( tokenizer, '"' ) ) {
      tokenizer.pos = start;
      return null;
    }

    return {
      t: RExpr.STRING_LITERAL,
      v: string
    };
  }

  if ( getStringMatch( tokenizer, "'" ) ) {
    string = getSingleQuotedString( tokenizer );

    if ( !getStringMatch( tokenizer, "'" ) ) {
      tokenizer.pos = start;
      return null;
    }

    return {
      t: RExpr.STRING_LITERAL,
      v: string
    };
  }

  return null;
};

getName = getRegexMatcher( /^[a-zA-Z_$][a-zA-Z_$0-9]*/ );

getDotRefinement = getRegexMatcher( /^\.[a-zA-Z_$0-9]+/ );

getArrayRefinement = function ( tokenizer ) {
  var num = getArrayMember( tokenizer );

  if ( num ) {
    return '.' + num;
  }

  return null;
};

getArrayMember = getRegexMatcher( /^\[(0|[1-9][0-9]*)\]/ );
