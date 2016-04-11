/* global hexo */

var path = require('path');

if (!hexo.config.api_box || !hexo.config.api_box.data_file) {
  throw new Error("You need to provide the location of the api box data file in config.api_box.data_file");
}

var dataPath = path.join(hexo.base_dir, hexo.config.api_box.data_file)
var data = require(dataPath);

hexo.extend.tag.register('apibox', function(args) {
  var name = args[0];
  return '<div>' + JSON.stringify(data[name]) + '</div>';
});
