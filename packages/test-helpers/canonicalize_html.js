canonicalizeHtml = function(html) {
  var h = html;
  // kill IE-specific comments inserted by DomRange
  h = h.replace(/<!--IE-->/g, '');
  h = h.replace(/<!---->/g, '');
  // ignore exact text of comments
  h = h.replace(/<!--.*?-->/g, '<!---->');
  // make all tags lowercase
  h = h.replace(/<\/?(\w+)/g, function(m) {
    return m.toLowerCase(); });
  // replace whitespace sequences with spaces
  h = h.replace(/\s+/g, ' ');
  // Trim leading and trailing whitespace
  h = h.replace(/^\s+|\s+$/g, '');
  // remove whitespace before and after tags
  h = h.replace(/\s*(<\/?\w.*?>)\s*/g, function (m, tag) {
    return tag; });
  // make tag attributes uniform
  h = h.replace(/<(\w+)\s+(.*?)\s*>/g, function(m, tagName, attrs) {
    // Drop expando property used by Sizzle (part of jQuery) which leaks into
    // attributes in IE8. Note that its value always contains spaces.
    attrs = attrs.replace(/sizcache[0-9]+="[^"]*"/g, ' ');
    // Similarly for expando properties used by jQuery to track data.
    attrs = attrs.replace(/jQuery[0-9]+="[0-9]+"/g, ' ');
    // Similarly for expando properties used to DOMBackend to keep
    // track of callbacks to fire when an element is removed
    attrs = attrs.replace(/\$blaze_teardown_callbacks="[^"]*"/g, ' ');
    // And by DOMRange to keep track of the element's DOMRange
    attrs = attrs.replace(/\$blaze_range="[^"]*"/g, ' ');

    attrs = attrs.replace(/\s*=\s*/g, '=');
    attrs = attrs.replace(/^\s+/g, '');
    attrs = attrs.replace(/\s+$/g, '');
    attrs = attrs.replace(/\s+/g, ' ');
    // quote unquoted attribute values, as in `type=checkbox`.  This
    // will do the wrong thing if there's an `=` in an attribute value.
    attrs = attrs.replace(/(\w)=([^'" >/]+)/g, '$1="$2"');

    // for the purpose of splitting attributes in a string like 'a="b"
    // c="d"', assume they are separated by a single space and values
    // are double- or single-quoted, but allow for spaces inside the
    // quotes.  Split on space following quote.
    var attrList = attrs.replace(/(\w)='([^']*)' /g, "$1='$2'\u0000");
    attrList = attrList.replace(/(\w)="([^"]*)" /g, '$1="$2"\u0000');
    attrList = attrList.split("\u0000");
    // put attributes in alphabetical order
    attrList.sort();

    var tagContents = [tagName];

    for(var i=0; i<attrList.length; i++) {
      // If there were no attrs, attrList could be `[""]`,
      // so skip falsy values.
      if (! attrList[i])
        continue;
      var a = attrList[i].split('=');

      // In IE8, attributes whose value is "" appear
      // without the '=' sign altogether.
      if (a.length < 2)
        a.push("");

      var key = a[0];
      // Drop another expando property used by Sizzle.
      if (key === 'sizset')
        continue;
      var value = a[1];

      // make sure the attribute is doubled-quoted
      if (value.charAt(0) === '"') {
        // Do nothing
      } else {
        if (value.charAt(0) !== "'") {
          // attribute is unquoted. should be unreachable because of
          // regex above.
          value = '"' + value + '"';
        } else {
          // attribute is single-quoted. make it double-quoted.
          value = value.replace(/\"/g, "&quot;");
        }
        value = value.replace(/["'`]/g, '"');
      }

      // Encode quotes and double quotes in the attribute.
      var attr = value.slice(1, -1);
      attr = attr.replace(/\"/g, "&quot;");
      attr = attr.replace(/\'/g, "&quot;");
      value = '"' + attr + '"';

      // Ensure that styles do not end with a semicolon.
      if (key === 'style') {
        value = value.replace(/;\"$/, '"');
      }

      tagContents.push(key+'='+value);
    }
    return '<'+tagContents.join(' ')+'>';
  });
  return h;
};
