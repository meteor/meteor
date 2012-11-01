// Source: https://github.com/coreyti/showdown

// XXX rename to 'markdown' and credit showdown some other way?

var path = require('path');

Package.describe({
  summary: "Markdown-to-HTML processor"
});

// XXX hack -- need a way to use a package at bundle time
var _ = require(path.join('..', '..', 'packages', 'underscore', 'underscore.js'));

Package.on_use(function (api, where) {
  where = where || ["client", "server"];
  where = where instanceof Array ? where : [where];

  api.add_files("showdown.js", where);

  // XXX what we really want to do is, load template-integration after
  // handlebars, iff handlebars was included in the project.
  if (where === "client" ||
      (where instanceof Array && _.indexOf(where, "client") !== -1)) {
    api.use("handlebars", "client");
    api.add_files("template-integration.js", "client");
  }
});
