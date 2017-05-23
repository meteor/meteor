Package.describe({
  summary: "CanJS is an MIT-licensed, client-side, JavaScript framework that makes building rich web applications easy."
});

Package.on_use(function (api) {
  // XXX CanJS requires jquery (or zepto, dojo, mootools or yui)
  api.use("jquery");

  api.add_files("can.jquery.js", "client");
});
