/* global hexo */

var showdown  = require('showdown');
var converter = new showdown.Converter();

hexo.extend.tag.register('dtdd', function(args, content) {
  // sort of hacky but allows x:y
  var argsJson = '{"' + args.join('","').replace(':', '":"') + '"}';
  var options = JSON.parse(argsJson);

  var typespan = '';
  if (options.type) {
    typespan = '<span class="type">' + options.type + '</span>';
  }

  var idstr = '';
  if (options.id) {
    idstr = 'id="' + options.id + '"';
  }
  var namespan = '<span class="name" ' + idstr + '>' + options.name + '</span>';

  var markdownContent = converter.makeHtml(content);
  return '<dt>' + namespan + typespan + '</dt><dd>' + markdownContent + '</dd>';
}, {ends: true});
