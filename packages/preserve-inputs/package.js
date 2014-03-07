Package.describe({
  summary: "Automatically preserve form fields with a unique id",
  version: "1.0.0"
});

Package.on_use(function (api) {
  api.use(['underscore', 'spark']);
  api.add_files("preserve-inputs.js", "client");
});
