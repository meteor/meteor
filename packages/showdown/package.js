// Source: https://github.com/coreyti/showdown

// XXX rename to 'markdown' and credit showdown some other way?

Package.describe({
  summary: "Markdown-to-HTML processor",
  environments: ["client"]
});

Package.source("showdown.js");

// XXX what we really want to do is, load template-integration after
// handlebars, iff handlebars was included in the project. and should
// support server also, but not load template-integration there.
Package.depend("handlebars");
Package.source("template-integration.js");