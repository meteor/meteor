Package.describe({
  name: 'blaze-html-templates',
  version: '1.0.1',
  // Brief, one-line summary of the package.
  summary: 'Compile HTML templates into reactive UI with Meteor Blaze',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.imply([
    // A library for reactive user interfaces
    'blaze',

    // The following packages are basically empty shells that just exist to
    // satisfy code checking for the existence of a package. Rest assured that
    // they are not adding any bloat to your bundle.
    'ui', // XXX COMPAT WITH PACKAGES BUILT FOR 0.9.0.
    'spacebars', // XXX COMPAT WITH PACKAGES BUILT FOR 0.9.0

    // Compile .html files into Blaze reactive views
    'templating'
  ]);
});
