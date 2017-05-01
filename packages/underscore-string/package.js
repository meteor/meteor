Package.describe({
  summary: "String manipulation extensions for Underscore.js"
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.use('underscore', where);
  api.add_files('underscore.string.js', where);
});
