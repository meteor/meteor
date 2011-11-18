// Source: https://github.com/coreyti/showdown

// XXX rename to 'markdown' and credit showdown some other way?

Package.describe({
  summary: "Markdown-to-HTML processor"
});

Package.client_file("showdown.js");

// XXX what we really want to do is, load template-integration after
// handlebars, iff handlebars was included in the project
Package.require("handlebars");
Package.client_file("template-integration.js");