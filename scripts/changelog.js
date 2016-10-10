/* global hexo */

var fs = require('fs');
var showdown  = require('showdown');
var converter = new showdown.Converter();

// Read the file given, strip of #vNEXT, render w/ markdown
hexo.extend.tag.register('changelog', function(args) {
  var str = fs.readFileSync(args[0], 'utf8');
  str = str.replace('## v.NEXT', '');
  return converter.makeHtml(str);
});
