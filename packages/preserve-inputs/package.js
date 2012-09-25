Package.describe({
  summary: "Preserve inputs and other form elements by ID"
});

Package.on_use(function (api, where) {
  api.use(['underscore', 'spark', 'templating']);
  api.add_files(["labeler.js", "preserve-inputs.js"], "client");
});

/*Package.on_test(function (api) {
  api.add_files('labeler.js', 'client');
});*/
