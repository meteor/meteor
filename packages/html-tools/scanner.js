// This is a Scanner class suitable for any parser/lexer/tokenizer.
//
// A Scanner has an immutable source document (string) `input` and a current
// position `pos`, an index into the string, which can be set at will.
//
// * `new Scanner(input)` - constructs a Scanner with source string `input`
// * `scanner.rest()` - returns the rest of the input after `pos`
// * `scanner.peek()` - returns the character at `pos`
// * `scanner.isEOF()` - true if `pos` is at or beyond the end of `input`
// * `scanner.fatal(msg)` - throw an error indicating a problem at `pos`

Scanner = HTMLTools.Scanner = function (input) {
  this.input = input; // public, read-only
  this.pos = 0; // public, read-write
};

Scanner.prototype.rest = function () {
  // Slicing a string is O(1) in modern JavaScript VMs (including old IE).
  return this.input.slice(this.pos);
};

Scanner.prototype.isEOF = function () {
  return this.pos >= this.input.length;
};

Scanner.prototype.fatal = function (msg) {
  // despite this default, you should always provide a message!
  msg = (msg || "Parse error");

  var CONTEXT_AMOUNT = 20;

  var input = this.input;
  var pos = this.pos;
  var pastInput = input.substring(pos - CONTEXT_AMOUNT - 1, pos);
  if (pastInput.length > CONTEXT_AMOUNT)
    pastInput = '...' + pastInput.substring(-CONTEXT_AMOUNT);

  var upcomingInput = input.substring(pos, pos + CONTEXT_AMOUNT + 1);
  if (upcomingInput.length > CONTEXT_AMOUNT)
    upcomingInput = upcomingInput.substring(0, CONTEXT_AMOUNT) + '...';

  var positionDisplay = ((pastInput + upcomingInput).replace(/\n/g, ' ') + '\n' +
                         (new Array(pastInput.length + 1).join(' ')) + "^");

  var e = new Error(msg + "\n" + positionDisplay);

  e.offset = pos;
  var allPastInput = input.substring(0, pos);
  e.line = (1 + (allPastInput.match(/\n/g) || []).length);
  e.col = (1 + pos - allPastInput.lastIndexOf('\n'));
  e.scanner = this;

  throw e;
};

// Peek at the next character.
//
// If `isEOF`, returns an empty string.
Scanner.prototype.peek = function () {
  return this.input.charAt(this.pos);
};

// Constructs a `getFoo` function where `foo` is specified with a regex.
// The regex should start with `^`.  The constructed function will return
// match group 1, if it exists and matches a non-empty string, or else
// the entire matched string (or null if there is no match).
//
// A `getFoo` function tries to match and consume a foo.  If it succeeds,
// the current position of the scanner is advanced.  If it fails, the
// current position is not advanced and a falsy value (typically null)
// is returned.
makeRegexMatcher = function (regex) {
  return function (scanner) {
    var match = regex.exec(scanner.rest());

    if (! match)
      return null;

    scanner.pos += match[0].length;
    return match[1] || match[0];
  };
};
