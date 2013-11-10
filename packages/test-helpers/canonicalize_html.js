canonicalizeHtml = function(html) {
  var h = html;
  // kill IE-specific comments inserted by DomRange
  h = h.replace(/<!--IE-->/g, '');
  // ignore exact text of comments
  h = h.replace(/<!--.*?-->/g, '<!---->');
  // make all tags lowercase
  h = h.replace(/<\/?(\w+)/g, function(m) {
    return m.toLowerCase(); });
  // kill \n and \r characters
  h = h.replace(/[\n\r]/g, '');
  // make tag attributes uniform
  h = h.replace(/<(\w+)\s+(.*?)\s*>/g, function(m, tagName, attrs) {
    // Drop expando property used by Sizzle (part of jQuery) which leaks into
    // attributes in IE8. Note that its value always contains spaces.
    attrs = attrs.replace(/sizcache[0-9]+="[^"]*"/g, ' ');
    // Similarly for expando properties used by jQuery to track data.
    attrs = attrs.replace(/jQuery[0-9]+="[0-9]+"/g, ' ');
    attrs = attrs.replace(/\s*=\s*/g, '=');
    attrs = attrs.replace(/^\s+/g, '');
    attrs = attrs.replace(/\s+$/g, '');
    attrs = attrs.replace(/\s+/g, ' ');
    // for the purpose of splitting attributes in a string like
    // 'a="b" c="d"', assume they are separated by a single space
    // and values are double-quoted, but allow for spaces inside
    // the quotes.  Split on space following quote.
    var attrList = attrs.replace(/" /g, '"\u0000').split('\u0000');
    // put attributes in alphabetical order
    attrList.sort();

    var tagContents = [tagName];

    for(var i=0; i<attrList.length; i++) {
      // If there were no attrs, attrList could be `[""]`,
      // so skip falsy values.
      if (! attrList[i])
        continue;
      var a = attrList[i].split('=');
        if (a.length < 2)
          a.push(a[0]); // things like checked=checked, in theory
      var key = a[0];
      // Drop another expando property used by Sizzle.
      if (key === 'sizset')
        continue;
      var value = a[1];
      value = value.replace(/["'`]/g, '"');
      if (value.charAt(0) !== '"')
        value = '"'+value+'"';
      tagContents.push(key+'='+value);
    }
    return '<'+tagContents.join(' ')+'>';
  });
  return h;
};
