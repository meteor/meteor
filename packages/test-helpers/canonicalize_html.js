var canonicalizeHtml = function(html) {
  var h = html;
  // kill IE-specific comments inserted by Spark
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
    attrs = attrs.replace(/\s*=\s*/g, '=');
    attrs = attrs.replace(/\s+/g, ' ');
    var attrList = attrs.split(' ');
    // put attributes in alphabetical order
    attrList.sort();
    for(var i=0; i<attrList.length; i++) {
      var a = attrList[i].split('=');
      if (a.length < 2)
        a.push(a[0]); // things like checked=checked, in theory
      var key = a[0];
      var value = a[1];
      value = value.replace(/["'`]/g, '"');
      if (value.charAt(0) !== '"')
        value = '"'+value+'"';
      attrList[i] = key+'='+value;
    }
    return '<'+tagName+' '+attrList.join(' ')+'>';
  });
  return h;
};
