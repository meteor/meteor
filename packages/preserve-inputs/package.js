Package.describe({
  summary: "Preserve inputs and other form elements by ID"
});

Package.on_use(function (api, where) {
  api.use(['underscore', 'spark']);
  api.add_files("preserve-inputs.js", "client");
});
