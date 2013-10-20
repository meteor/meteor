
Scanner = function (input) {
  this.input = input; // public, read-only
  this.pos = 0; // public, read-write
};

Scanner.prototype.rest = function () {
  return this.input.slice(this.pos);
};

Scanner.prototype.isEOF = function () {
  return this.pos >= this.input.length;
};

Scanner.prototype.fatal = function (msg) {
  // despite this default, you should always provide a message!
  msg = (msg || "Parse error");

  // XXX show line/col information, etc.
  // XXX attach information to the error object.
  throw new Error("Index " + this.pos + ": " + msg);
};

// Peek at the next character, or run a provided "matcher" function
// but reset the current position afterwards.  Fatal failure of the
// matcher is not suppressed.
Scanner.prototype.peek = function (matcher) {
  if (! matcher)
    return this.rest().charAt(0);

  var start = this.pos;
  var result = matcher(this);
  this.pos = start;
  return result;
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
  return function (scanner, peek) {
    var match = regex.exec(scanner.rest());

    if (! match)
      return null;

    scanner.pos += match[0].length;
    return match[1] || match[0];
  };
};
