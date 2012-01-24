// Source: https://github.com/coreyti/showdown

// XXX rename to 'markdown' and credit showdown some other way?

Package.describe({
  summary: "Markdown-to-HTML processor"
});

// XXX hack -- need a way to use a package at bundle time
var _ = require('../../packages/underscore/underscore.js');

Package.on_use(function (api, where) {
  where = where || ["client", "server"];
  where = where instanceof Array ? where : [where];

  Package.add_files("showdown.js", where);

  // XXX what we really want to do is, load template-integration after
  // handlebars, iff handlebars was included in the project.
  if (_.indexOf(where, "client") !== -1) {
    Package.depend("handlebars");
    Package.source("template-integration.js");
  }
});