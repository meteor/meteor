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

getSingleQuotedString = function ( tokenizer ) {
  var start, string, escaped, unescaped, next;

  start = tokenizer.pos;

  string = '';

  escaped = getEscapedChars( tokenizer );
  if ( escaped ) {
    string += escaped;
  }

  unescaped = getUnescapedSingleQuotedChars( tokenizer );
  if ( unescaped ) {
    string += unescaped;
  }
  if ( string ) {
    next = getSingleQuotedString( tokenizer );
    while ( next ) {
      string += next;
      next = getSingleQuotedString( tokenizer );
    }
  }

  return string;
};

var getUnescapedSingleQuotedChars = getRegexMatcher( /^[^\\']+/ );

getDoubleQuotedString = function ( tokenizer ) {
  var start, string, escaped, unescaped, next;

  start = tokenizer.pos;

  string = '';

  escaped = getEscapedChars( tokenizer );
  if ( escaped ) {
    string += escaped;
  }

  unescaped = getUnescapedDoubleQuotedChars( tokenizer );
  if ( unescaped ) {
    string += unescaped;
  }

  if ( !string ) {
    return '';
  }

  next = getDoubleQuotedString( tokenizer );
  while ( next !== '' ) {
    string += next;
  }

  return string;
};

var getUnescapedDoubleQuotedChars = getRegexMatcher( /^[^\\"]+/ );


var getEscapedChars = function ( tokenizer ) {
  var chars = '', character;

  character = getEscapedChar( tokenizer );
  while ( character ) {
    chars += character;
    character = getEscapedChar( tokenizer );
  }

  return chars || null;
};

var getEscapedChar = function ( tokenizer ) {
  var character;

  if ( !getStringMatch( tokenizer, '\\' ) ) {
    return null;
  }

  character = tokenizer.str.charAt( tokenizer.pos );
  tokenizer.pos += 1;

  return character;
};
