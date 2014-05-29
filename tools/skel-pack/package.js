Package.describe({
  summary: "Hello world!",
  version: "1.0.0",
  name: "hello" 
});

Package.on_use(function(api) {
  api.add_files('hello.js');
});
