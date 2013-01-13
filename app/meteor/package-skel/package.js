var path = require("path");

Package.describe({
  // Give a brief description of your package here.
  summary: "Hello, world! This is my Meteor smart package."
});

Package.on_use(function (api) {
  // This code will run when your package is used,
  // which is at runtime.
  
  // This line adds the file "hello.html" to the client
  // at runtime.
  api.add_files(["hello.html"], "client");
});
