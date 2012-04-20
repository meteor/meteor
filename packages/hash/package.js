Package.describe({
  summary: "Hashing helper method"
});

Package.on_use(function(api) {
  api.add_files('hash.js', ['server']);
  //At the moment only the server and I didn't want to fake with meteor methods as would create a false sense of security
});