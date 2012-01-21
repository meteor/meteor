Package.describe({
  summary: "A minimalist client-side MVC framework",
  environments: ["client"]
});

// XXX Backbone requires either jquery or zepto
Package.depend("jquery");

Package.source("backbone.js");
