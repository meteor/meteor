var Component = UIComponent;

var ESCAPED_CHARS_UNQUOTED_REGEX = /[&<>]/g;
var ESCAPED_CHARS_QUOTED_REGEX = /[&<>"]/g;

var escapeMap = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;"
};
var escapeOne = function(c) {
  return escapeMap[c];
};

var encodeEntities = function (text, isQuoted) {
  // Encode Unicode characters to HTML entities.
  //
  // This implementation just encodes the characters that otherwise
  // wouldn't parse (like `<`) and passes the rest through.  You'd
  // need to do something different if you care about HTML entities as
  // a way to embed special characters in ASCII.
  return text.replace(isQuoted ? ESCAPED_CHARS_QUOTED_REGEX :
                      ESCAPED_CHARS_UNQUOTED_REGEX, escapeOne);
};


_UI.Text = Component.extend({
  _encodeEntities: encodeEntities,
  _stringify: function (x) {
    return String(x || '');
  },
  render: function (buf) {
    var data = this.data();
    buf(this._encodeEntities(this._stringify(data)));
  }
});

_UI.HTML = Component.extend({
  _stringify: function (x) {
    return String(x || '');
  },
  render: function (buf) {
    var data = this.data();
    buf(this._stringify(data));
  }
});
