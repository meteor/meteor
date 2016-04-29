// On page load, check the hash fragment and redirect to the right place
var KNOWN_ID_PAGES = require('./redirects.js');

// Figure out which page that id lives on based on the old toc
var src =
  'var KNOWN_ID_PAGES = ' + JSON.stringify(KNOWN_ID_PAGES) + ';\n' +
  'var id = location.hash.split("/").pop();\n' +
  'if (KNOWN_ID_PAGES[id]) {\n' +
    'location.replace(KNOWN_ID_PAGES[id] + "#" + id);\n' +
  '}';

hexo.extend.tag.register('followRedirects', function(args) {
  return '<script>\n' + src + '\n</script>';
});
