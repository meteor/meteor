Package.describe({
  summary: "DEPRECATED: Generate absolute URLs pointing to the application"
});

Package.on_use(function (api) {
  console.log('DEPRECATED. The `absolute-url` package has been folded into '
              + 'the `meteor` package and should not be used directly.');
});
