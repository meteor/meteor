
parseFragment = function (input) {
  var scanner = new Scanner(input);

  // XXX
};

// Take a numeric Unicode code point, which may be larger than 16 bits,
// and encode it as a JavaScript UTF-16 string.
//
// Adapted from
// http://stackoverflow.com/questions/7126384/expressing-utf-16-unicode-characters-in-javascript/7126661.
var codePointToString = function(cp) {
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

    // XXX cover all token types
    if (token.t === 'Doctype') {
      scanner.fatal("Unexpected Doctype");
    } else if (token.t === 'Chars') {
      if (items.length && typeof items[items.length - 1] === 'string')
        items[items.length - 1] += token.v;
      else
        items.push(token.v);
    } else if (token.t === 'CharRef') {
      var codePoints = token.cp;
      var str = '';
      for (var i = 0; i < codePoints.length; i++)
        str += codePointToString(codePoints[i]);
      items.push(HTML.CharRef({ html: token.v,
                                str: str }));
    } else if (token.t === 'Comment') {
      items.push(HTML.Comment(token.v));
    } else {
      throw new Error(token.t);
    }
  }

  if (items.length === 0)
    return null;
  else if (items.length === 1)
    return items[0];
  else
    return items;
};