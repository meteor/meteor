
var voidElementNames = 'area base br col command embed hr img input keygen link meta param source track wbr'.split(' ');
var voidElementSet = (function (set) {
  for (var i = 0; i < voidElementNames.length; i++)
    set[voidElementNames[i]] = 1;

  return set;
})({});

knownElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol p param pre q s samp script select small span strike strong style sub sup textarea title tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split(' ');
var knownElementSet = (function (set) {
  for (var i = 0; i < knownElementNames.length; i++)
    set[knownElementNames[i]] = 1;

  return set;
})({});

isVoidElement = function (name) {
  return voidElementSet[properCaseTagName(name)] === 1;
};

isKnownElement = function (name) {
  return knownElementSet[properCaseTagName(name)] === 1;
};

parseFragment = function (input) {
  var scanner = new Scanner(input);

  var result = getContent(scanner);
  if (! scanner.isEOF())
    scanner.fatal("Expected EOF");

  return result;
};

// Take a numeric Unicode code point, which may be larger than 16 bits,
// and encode it as a JavaScript UTF-16 string.
//
// Adapted from
// http://stackoverflow.com/questions/7126384/expressing-utf-16-unicode-characters-in-javascript/7126661.
codePointToString = function(cp) {
  if (cp >= 0 && cp <= 0xD7FF || cp >= 0xE000 && cp <= 0xFFFF) {
    return String.fromCharCode(cp);
  } else if (cp >= 0x10000 && cp <= 0x10FFFF) {

    // we substract 0x10000 from cp to get a 20-bit number
    // in the range 0..0xFFFF
    cp -= 0x10000;

    // we add 0xD800 to the number formed by the first 10 bits
    // to give the first byte
    var first = ((0xffc00 & cp) >> 10) + 0xD800;

    // we add 0xDC00 to the number formed by the low 10 bits
    // to give the second byte
    var second = (0x3ff & cp) + 0xDC00;

    return String.fromCharCode(first) + String.fromCharCode(second);
  } else {
    return '';
  }
};

getContent = function (scanner) {
  var items = [];

  while (! scanner.isEOF()) {
    // Stop at any top-level end tag.  We could use the tokenizer
    // but these two characters are a giveaway.
    if (scanner.rest().slice(0, 2) === '</')
      break;

    var token = getHTMLToken(scanner);

    if (token.t === 'Doctype') {
      scanner.fatal("Unexpected Doctype");
    } else if (token.t === 'Chars') {
      if (items.length && typeof items[items.length - 1] === 'string')
        items[items.length - 1] += token.v;
      else
        items.push(token.v);
    } else if (token.t === 'CharRef') {
      items.push(convertCharRef(token));
    } else if (token.t === 'Comment') {
      items.push(HTML.Comment(token.v));
    } else if (token.t === 'Tag') {
      if (token.isEnd)
        // we've already screened for `</` so this shouldn't be
        // possible.
        scanner.fatal("Assertion failed: didn't expect end tag");

      var tagName = token.n;
      // is this an element with no close tag (a BR, HR, IMG, etc.) based
      // on its name?
      var isVoid = isVoidElement(tagName);
      if (! isVoid) {
        if (token.isSelfClosing)
          scanner.fatal('Only certain elements like BR, HR, IMG, etc. are allowed to self-close');
      }

      // may be null
      var attrs = parseAttrs(token.attrs);

      var tagFunc = HTML.getTag(tagName);
      if (isVoid) {
        items.push(attrs ? tagFunc(attrs) : tagFunc());
      } else {
        var content = getContent(scanner);

        if (scanner.rest().slice(0, 2) !== '</')
          scanner.fatal('Expected "' + tagName + '" end tag');

        var endTag = getTagToken(scanner);

        if (! (endTag.t === 'Tag' && endTag.isEnd))
          // we've already seen `</` so this shouldn't be possible
          // without erroring.
          scanner.fatal("Assertion failed: expected end tag");

        // XXX support implied end tags in cases allowed by the spec
        if (endTag.n !== tagName)
          scanner.fatal('Expected "' + tagName + '" end tag, found "' + endTag.n + '"');

        items.push(HTML.getTag(tagName).apply(
          null, (attrs ? [attrs] : []).concat(
            HTML.typeOf(content) === 'array' ? content : [content])));
      }
    } else {
      scanner.fatal("Unknown token type: " + token.t);
    }
  }

  if (items.length === 0)
    return null;
  else if (items.length === 1)
    return items[0];
  else
    return items;
};

// Takes a token with `{ t: 'Tag', isEnd: true }` and makes sure it
// doesn't have weird stuff like attributes.
var checkEndTag = function (token, scanner) {
  if (token.isSelfClosing)
    scanner.fatal("End tag can't have trailing slash");

  // token has an `attrs` property but there shouldn't be any
  // attributes in it.
  for (var k in token.attrs)
    scanner.fatal("End tag can't have attributes");
};

// Input: A token like `{ t: 'CharRef', v: '&amp;', cp: [38] }`.
//
// Output: A tag like `HTML.CharRef({ html: '&amp;', str: '&' })`.
var convertCharRef = function (token) {
  var codePoints = token.cp;
  var str = '';
  for (var i = 0; i < codePoints.length; i++)
    str += codePointToString(codePoints[i]);
  return HTML.CharRef({ html: token.v, str: str });
};

// Input is always a dictionary (even if zero attributes) and each
// value in the dictionary is an array of `Chars` and `CharRef`
// tokens.  An empty array means the attribute has a value of "".
//
// Output is null if there are zero attributes, and otherwise a
// dictionary.  Each value in the dictionary is a string (possibly
// empty) or an array of non-empty strings and CharRef tags.
var parseAttrs = function (attrs) {
  var result = null;

  for (var k in attrs) {
    if (! result)
      result = {};

    var inValue = attrs[k];
    var outValue = '';
    for (var i = 0; i < inValue.length; i++) {
      var token = inValue[i];
      if (token.t === 'CharRef') {
        if (! outValue)
          outValue = [];
        else if (typeof outValue === 'string')
          outValue = [outValue];

        outValue.push(convertCharRef(token));
      } else if (token.t === 'Chars') {
        var str = token.v;

        if (typeof outValue === 'string')
          outValue += str;
        else
          outValue.push(str);
      }
    }

    result[k] = outValue;
  }

  return result;
};