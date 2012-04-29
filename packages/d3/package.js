Package.describe({
  summary: "Make cool visualizations with d3"
});

Package.on_use(function (api) {
	api.use('d3', 'client');
  api.add_files('d3.v2.js', 'client');
});
