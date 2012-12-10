Package.describe({
    summary: "A reactive variable",
    internal: true
});


Package.on_use(function (api) {
    api.add_files('reactive-var.js', 'client');
});
