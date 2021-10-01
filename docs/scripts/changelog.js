/* global hexo */

var fs = require('fs');
var showdown  = require('showdown');
var converter = new showdown.Converter({
  disableForced4SpacesIndentedSublists: true,
});

// Read the file given, strip of #vNEXT, render w/ markdown
hexo.extend.tag.register('changelog', function(args) {
  var str = fs.readFileSync(args[0], 'utf8');
  // Remove everything from `## v.NEXT` until the next H2 (released) heading.
  str = str.replace(/^## v\.NEXT.*?^(?=##[^#])/ms, '');
  return converter.makeHtml(str);
});
