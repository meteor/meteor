Package.describe({
  summary: "A minimalist client-side MVC framework"
});

// Backbone requires either jquery or zepto
Package.require("jquery");

Package.client_file("backbone.js");
