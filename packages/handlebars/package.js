Package.describe({
  summary: "Simple semantic templating language",
  internal: true
});

Package.on_use(function (api) {
  // XXX This package has been folded into the 'templating' package
  // for now. Historically, you could see it in your package list
  // (because it didn't have internal: true, which it probably should
  // have), but adding it didn't do anything (because it just
  // contained the handlebars precompiler and runtime, not any
  // functions you could call yourself.) So leave it around as an
  // empty package for the moment so as to not break the projects of
  // anyone that happened to type 'meteor add handlebars' because they
  // thought they had to.
});
