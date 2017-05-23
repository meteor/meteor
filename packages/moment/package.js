Package.describe({
  summary: "A lightweight javascript date library for parsing, manipulating, and formatting dates."
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];
  api.add_files("moment.js", where);
});
