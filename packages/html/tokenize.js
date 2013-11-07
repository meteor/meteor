
var HTML_SPACE = /^[\f\n\t ]/;

var asciiLowerCase = function (str) {
  return str.replace(/[A-Z]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) + 32);
  });
};

getComment = function (scanner) {
  if (scanner.rest().slice(0, 4) !== '<!--')
    return null;
  scanner.pos += 4;

  // Valid comments are easy to parse; they end at the first `--`!
  // Our main job is throwing errors.

  var rest = scanner.rest();
  if (rest.charAt(0) === '>' || rest.slice(0, 2) === '->')
    scanner.fatal("HTML comment can't start with > or ->");

  var closePos = rest.indexOf('-->');
  if (closePos < 0)
    scanner.fatal("Unclosed HTML comment");

  var commentContents = rest.slice(0, closePos);
  if (commentContents.slice(-1) === '-')
    scanner.fatal("HTML comment must end at first `--`");
  if (commentContents.indexOf("--") >= 0)
    scanner.fatal("HTML comment cannot contain `--` anywhere");
  if (commentContents.indexOf('\u0000') >= 0)
    scanner.fatal("HTML comment cannot contain NULL");

  scanner.pos += closePos + 3;

  return { t: 'Comment',
           v: commentContents };
};

var skipSpaces = function (scanner) {
  while (HTML_SPACE.test(scanner.peek()))
    scanner.pos++;
};

var requireSpaces = function (scanner) {
  if (! HTML_SPACE.test(scanner.peek()))
    scanner.fatal("Expected space");
  skipSpaces(scanner);
};

var getDoctypeQuotedString = function (scanner) {
  var quote = scanner.peek();
  if (! (quote === '"' || quote === "'"))
    scanner.fatal("Expected single or double quote in DOCTYPE");
  scanner.pos++;

  if (scanner.peek() === quote)
    // prevent a falsy return value (empty string)
    scanner.fatal("Malformed DOCTYPE");

  var str = '';
  var ch;
  while ((ch = scanner.peek()), ch !== quote) {
    if ((! ch) || (ch === '\u0000') || (ch === '>'))
      scanner.fatal("Malformed DOCTYPE");
    str += ch;
    scanner.pos++;
  }

  scanner.pos++;

  return str;
};

// See http://www.whatwg.org/specs/web-apps/current-work/multipage/syntax.html#the-doctype.
//
// If `getDocType` sees "<!DOCTYPE" (case-insensitive), it will match or fail fatally.
getDoctype = function (scanner) {
  if (asciiLowerCase(scanner.rest().slice(0, 9)) !== '<!doctype')
    return null;
  var start = scanner.pos;
  scanner.pos += 9;

  requireSpaces(scanner);

  var ch = scanner.peek();
  if ((! ch) || (ch === '>') || (ch === '\u0000'))
    scanner.fatal('Malformed DOCTYPE');
  var name = ch;
  scanner.pos++;

  while ((ch = scanner.peek()), ! (HTML_SPACE.test(ch) || ch === '>')) {
    if ((! ch) || (ch === '\u0000'))
      scanner.fatal('Malformed DOCTYPE');
    name += ch;
    scanner.pos++;
  }
  name = asciiLowerCase(name);

  // Now we're looking at a space or a `>`.
  skipSpaces(scanner);

  var systemId = null;
  var publicId = null;

  if (scanner.peek() !== '>') {
    // Now we're essentially in the "After DOCTYPE name state" of the tokenizer,
    // but we're not looking at space or `>`.

    // this should be "public" or "system".
    var publicOrSystem = asciiLowerCase(scanner.rest().slice(0, 6));

    if (publicOrSystem === 'system') {
      scanner.pos += 6;
      requireSpaces(scanner);
      systemId = getDoctypeQuotedString(scanner);
      skipSpaces(scanner);
      if (scanner.peek() !== '>')
        scanner.fatal("Malformed DOCTYPE");
    } else if (publicOrSystem === 'public') {
      scanner.pos += 6;
      requireSpaces(scanner);
      publicId = getDoctypeQuotedString(scanner);
      if (scanner.peek() !== '>') {
        requireSpaces(scanner);
        if (scanner.peek() !== '>') {
          systemId = getDoctypeQuotedString(scanner);
          skipSpaces(scanner);
          if (scanner.peek() !== '>')
            scanner.fatal("Malformed DOCTYPE");
        }
      }
    } else {
      scanner.fatal("Expected PUBLIC or SYSTEM in DOCTYPE");
    }
  }

  // looking at `>`
  scanner.pos++;
  var result = { t: 'Doctype',
                 v: scanner.input.slice(start, scanner.pos),
                 name: name };

  if (systemId)
    result.systemId = systemId;
  if (publicId)
    result.publicId = publicId;

  return result;
};

var getChars = makeRegexMatcher(/^[^&<\u0000]+/);

getHTMLToken = function (scanner) {
  var chars = getChars(scanner);
  if (chars)
    return { t: 'Chars',
             v: chars };

  var ch = scanner.peek();
  if (! ch)
    return null; // EOF

  if (ch === '\u0000')
    scanner.fatal("Illegal NULL character");

  if (ch === '&') {
    var charRef = getCharacterReference(scanner);
    if (charRef)
      return charRef;

    scanner.pos++;
    return { t: 'Chars',
             v: '&' };
  }

  // If we're here, we're looking at `<`.
  // `getTag` will claim anything starting with `<` not followed by `!`.
  // `getComment` takes `<!--` and getDoctype takes `<!doctype`.
  var result = (getTag(scanner) || getComment(scanner) || getDoctype(scanner));

  if (result)
    return result;

  scanner.fatal("Unexpected `<!` directive.");
};

var getTagName = makeRegexMatcher(/^[a-zA-Z][^\f\n\t />]*/);
var getClangle = makeRegexMatcher(/^>/);
var getSlash = makeRegexMatcher(/^\//);
var getAttributeName = makeRegexMatcher(/^[^>/\u0000"'<=\f\n\t ][^\f\n\t /=>"'<\u0000]*/);

// Try to parse `>` or `/>`, mutating `tag` to be self-closing in the latter
// case (and failing fatally if `/` isn't followed by `>`).
// Return tag if successful.
var handleEndOfTag = function (scanner, tag) {
  if (getClangle(scanner))
    return tag;

  if (getSlash(scanner)) {
    if (! getClangle(scanner))
      scanner.fatal("Expected `>` after `/`");
    tag.isSelfClosing = true;
    return tag;
  }

  return null;
};

var getQuotedAttributeValue = function (scanner, quote) {
  if (scanner.peek() !== quote)
    return null;
  scanner.pos++;

  var tokens = [];
  var charsTokenToExtend = null;

  var charRef;
  while (true) {
    var ch = scanner.peek();
    if (ch === quote) {
      scanner.pos++;
      return tokens;
    } else if (! ch) {
      scanner.fatal("Unclosed quoted attribute in tag");
    } else if (ch === '\u0000') {
      scanner.fatal("Unexpected NULL character in attribute value");
    } else if (ch === '&' && (charRef = getCharacterReference(scanner, true, quote))) {
      tokens.push(charRef);
      charsTokenToExtend = null;
    } else {
      if (! charsTokenToExtend) {
        charsTokenToExtend = { t: 'Chars', v: '' };
        tokens.push(charsTokenToExtend);
      }
      charsTokenToExtend.v += ch;
      scanner.pos++;
    }
  }
};

var getUnquotedAttributeValue = function (scanner) {
  var tokens = [];
  var charsTokenToExtend = null;

  var charRef;
  while (true) {
    var ch = scanner.peek();
    if (HTML_SPACE.test(ch) || ch === '>') {
      return tokens;
    } else if (! ch) {
      scanner.fatal("Unclosed attribute in tag");
    } else if ('\u0000"\'<=`'.indexOf(ch) >= 0) {
      scanner.fatal("Unexpected character in attribute value");
    } else if (ch === '&' && (charRef = getCharacterReference(scanner, true, '>'))) {
      tokens.push(charRef);
      charsTokenToExtend = null;
    } else {
      if (! charsTokenToExtend) {
        charsTokenToExtend = { t: 'Chars', v: '' };
        tokens.push(charsTokenToExtend);
      }
      charsTokenToExtend.v += ch;
      scanner.pos++;
    }
  }
};

getTag = function (scanner) {
  if (! (scanner.peek() === '<' && scanner.rest().charAt(1) !== '!'))
    return null;
  scanner.pos++;

  var tag = { t: 'Tag' };

  // now looking at the character after `<`, which is not a `!`
  var isEndTag = false;
  if (scanner.peek() === '/') {
    tag.isEnd = true;
    scanner.pos++;
  }

  var tagName = getTagName(scanner);
  if (! tagName)
    scanner.fatal("Expected tag name after `<`");
  tag.n = asciiLowerCase(tagName);

  if (handleEndOfTag(scanner, tag))
    return tag;

  if (scanner.isEOF())
    scanner.fatal("Unclosed `<`");

  // ok, we must be looking at a space of some sort!
  // we're now in "Before attribute name state" of the tokenizer
  skipSpaces(scanner);

  if (handleEndOfTag(scanner, tag))
    return tag;

  tag.attrs = {};

  while (true) {
    var attributeName = getAttributeName(scanner);
    if (! attributeName)
      scanner.fatal("Expected attribute name in tag");
    attributeName = asciiLowerCase(attributeName);

    if (tag.attrs.hasOwnProperty(attributeName))
      scanner.fatal("Duplicate attribute in tag: " + attributeName);

    tag.attrs[attributeName] = [];

    skipSpaces(scanner);

    if (handleEndOfTag(scanner, tag))
      return tag;

    var ch = scanner.peek();
    if (! ch)
      scanner.fatal("Unclosed <");
    if ('\u0000"\'<'.indexOf(ch) >= 0)
      scanner.fatal("Unexpected character after attribute name in tag");

    if (ch === '=') {
      scanner.pos++;

      skipSpaces(scanner);

      ch = scanner.peek();
      if (! ch)
        scanner.fatal("Unclosed <");
      if ('\u0000><=`'.indexOf(ch) >= 0)
        scanner.fatal("Unexpected character after = in tag");

      var valueWasQuoted;
      if ((ch === '"') || (ch === "'")) {
        valueWasQuoted = true;
        tag.attrs[attributeName] = getQuotedAttributeValue(scanner, ch);
      } else {
        valueWasQuoted = false;
        tag.attrs[attributeName] = getUnquotedAttributeValue(scanner);
      }

      if (handleEndOfTag(scanner, tag))
        return tag;

      if (scanner.isEOF())
        scanner.fatal("Unclosed `<`");

      if (valueWasQuoted)
        requireSpaces(scanner);
      else
        skipSpaces(scanner);

      if (handleEndOfTag(scanner, tag))
        return tag;
    }
  }
};

tokenize = function (input) {
  var scanner = new Scanner(input);
  var tokens = [];
  while (! scanner.isEOF())
    tokens.push(getHTMLToken(scanner));

  return tokens;
};
