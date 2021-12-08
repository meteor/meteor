/* global hexo */

var parseTagOptions = require('./parseTagOptions');

hexo.extend.tag.register('dtdd', function(args, content) {
  var options = parseTagOptions(args);

  var typespan = '';
  if (options.type) {
    typespan = '<span class="type">' + options.type + '</span>';
  }

  var idstr = '';
  if (options.id) {
    idstr = 'id="' + options.id + '"';
  }
  var namespan = '<span class="name" ' + idstr + '>' + options.name + '</span>';

  return hexo.render.render({text: content, engine: 'md'})
    .then(function(markdownContent) {
      return '<dt>' + namespan + typespan + '</dt><dd>' + markdownContent + '</dd>';
    });
}, { ends: true, async: true });
