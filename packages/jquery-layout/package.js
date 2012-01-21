// XXX should probably nudge people toward the CSS Flexible Box Model
// flexie, rather than this

Package.describe({
  summary: "Easily create arbitrary multicolumn layouts",
  environments: ["client"]
});

Package.depend("jquery");
Package.source('jquery.layout.js');
