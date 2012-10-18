Package.describe({
  summary: "Automatically preserve all form fields with a unique id"
});

Package.on_use(function (api, where) {
  api.use(['underscore', 'spark']);
  api.add_files("preserve-inputs.js", "client");
});
