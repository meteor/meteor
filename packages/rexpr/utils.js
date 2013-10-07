var leadingWhitespace = /^\s+/;

allowWhitespace = function ( tokenizer ) {
  var match = leadingWhitespace.exec( tokenizer.str.substring( tokenizer.pos ) );

  if ( !match ) {
    return null;
  }

  tokenizer.pos += match[0].length;
  return match[0];
};

getStringMatch = function ( tokenizer, string ) {
  var substr;

  substr = tokenizer.str.substr( tokenizer.pos, string.length );

  if ( substr === string ) {
    tokenizer.pos += string.length;
    return string;
  }

  return null;
};

fail = function ( tokenizer, expected ) {
  var remaining = tokenizer.remaining().substr( 0, 40 );
  if ( remaining.length === 40 ) {
    remaining += '...';
  }
  throw new Error( 'Tokenizer failed: unexpected string "' + remaining + '" (expected ' + expected + ')' );
};

getRegexMatcher = function ( regex ) {
  return function ( tokenizer ) {
    var match = regex.exec( tokenizer.str.substring( tokenizer.pos ) );

    if ( !match ) {
      return null;
    }

    tokenizer.pos += match[0].length;
    return match[1] || match[0];
  };
};

// Match one or more characters until: ", ', \, or EOL/EOF.
// EOL/EOF is written as (?!.) (meaning there's no non-newline char next).
var getStringMiddle = getRegexMatcher(/^(?=.)[^"'\\]+?(?:(?!.)|(?=["'\\]))/);

// Match one escape sequence, including the backslash.
var getEscapeSequence =
      getRegexMatcher(/^\\(?:['"\\bfnrt]|0(?![0-9])|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|(?=.)[^ux0-9])/);

// Match one ES5 line continuation (backslash + line terminator).
var getLineContinuation =
      getRegexMatcher(/^\\(?:\r\n|[\u000A\u000D\u2028\u2029])/);


var getQuotedStringMatcher = function (quote, okQuote) {
  return function ( tokenizer ) {
    var start, literal, done, next;

    start = tokenizer.pos;

    literal = '"';

    done = false;

    while (! done) {
      next = (getStringMiddle( tokenizer ) ||
              getEscapeSequence( tokenizer ) ||
              getStringMatch( tokenizer, okQuote));
      if ( next ) {
        if ( next === '"' ) {
          literal += '\\"';
        } else if (next === "\\'") {
          literal += "'";
        } else {
          literal += next;
        }
      } else {
        next = getLineContinuation( tokenizer );
        if ( next ) {
          // convert \(newline-like) into a \u escape, which is allowed in JSON
          literal += '\\u' +
            ('000' + next.charCodeAt(1).toString(16)).slice(-4);
        } else {
          done = true;
        }
      }
    }

    literal += '"';

    // use JSON.parse to interpret escapes
    return JSON.parse(literal);
  };
};

getDoubleQuotedString = getQuotedStringMatcher('"', "'");

getSingleQuotedString = getQuotedStringMatcher("'", '"');
