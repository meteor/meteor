
var HTML_SPACE = /^[\u0009\u000A\u000C\u0020]/;

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

getDoctype = function (scanner) {
  if (scanner.rest().slice(0, 9) !== '<!DOCTYPE')
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

  if (scanner.peek() === '>') {
    scanner.pos++;
    return { t: 'Doctype',
             v: scanner.input.slice(start, scanner.pos),
             name: name };
  }

  // Now we're essentially in the "After DOCTYPE name state" of the tokenizer,
  // but we're not looking at space or `>`.

  var publicOrSystem = scanner.rest().slice(0, 6);
  // this should be PUBLIC or SYSTEM.
  // See http://dev.w3.org/html5/html-author/#doctype-declaration about legacy doctypes.

  // XXX how to we parse something like <!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"
  // SYSTEM "http://www.w3.org/TR/html4/strict.dtd"> with both PUBLIC and SYSTEM?
  // I don't see in the spec where it parses SYSTEM in that case.

  return null;
};